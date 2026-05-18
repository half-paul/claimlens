import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { Annotation, Article, Db, Reference, User } from "./types";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://factcheck:factcheck@localhost:5432/factcheck";

const globalForPg = globalThis as unknown as { factCheckPool?: Pool; factCheckSchemaReady?: Promise<void> };

export const pool =
  globalForPg.factCheckPool ??
  new Pool({
    connectionString: databaseUrl
  });

if (process.env.NODE_ENV !== "production") globalForPg.factCheckPool = pool;

export function makeId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export async function ensureSchema() {
  if (!globalForPg.factCheckSchemaReady) {
    globalForPg.factCheckSchemaReady = readFile(path.join(process.cwd(), "lib", "schema.sql"), "utf8").then((schema) =>
      pool.query(schema).then(() => undefined)
    );
  }
  await globalForPg.factCheckSchemaReady;
}

export async function resetDb() {
  const schema = await readFile(path.join(process.cwd(), "lib", "schema.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(81424001)");
    await client.query(`
      DROP TABLE IF EXISTS annotation_references;
      DROP TABLE IF EXISTS annotations;
      DROP TABLE IF EXISTS articles;
      DROP TABLE IF EXISTS allowed_domains;
      DROP TABLE IF EXISTS users;
    `);
    await client.query(schema);
    await client.query("COMMIT");
    globalForPg.factCheckSchemaReady = Promise.resolve();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readDb(): Promise<Db> {
  await ensureSchema();
  const [articles, annotations, references, users, domains] = await Promise.all([
    pool.query<ArticleRow>("SELECT * FROM articles ORDER BY imported_at DESC"),
    pool.query<AnnotationRow>("SELECT * FROM annotations ORDER BY created_at DESC"),
    pool.query<ReferenceRow>("SELECT * FROM annotation_references ORDER BY created_at DESC"),
    pool.query<UserRow>("SELECT * FROM users ORDER BY name ASC"),
    pool.query<{ domain: string }>("SELECT domain FROM allowed_domains ORDER BY domain ASC")
  ]);

  return {
    articles: articles.rows.map(rowToArticle),
    annotations: annotations.rows.map(rowToAnnotation),
    references: references.rows.map(rowToReference),
    users: users.rows.map(rowToUser),
    allowed_domains: domains.rows.map((row) => row.domain)
  };
}

export async function upsertArticle(article: Article) {
  await ensureSchema();
  const result = await pool.query<ArticleRow>(
    `
      INSERT INTO articles (
        id, source_url, canonical_url, source_site, title, raw_html, cleaned_text,
        structured_content_json, imported_by_user_id, imported_at, source_revision_id,
        article_score, article_summary, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (canonical_url) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        source_site = EXCLUDED.source_site,
        title = EXCLUDED.title,
        raw_html = EXCLUDED.raw_html,
        cleaned_text = EXCLUDED.cleaned_text,
        structured_content_json = EXCLUDED.structured_content_json,
        imported_by_user_id = EXCLUDED.imported_by_user_id,
        imported_at = EXCLUDED.imported_at,
        source_revision_id = EXCLUDED.source_revision_id,
        status = EXCLUDED.status
      RETURNING *
    `,
    [
      article.id,
      article.source_url,
      article.canonical_url,
      article.source_site,
      article.title,
      article.raw_html,
      article.cleaned_text,
      JSON.stringify(article.structured_content_json),
      article.imported_by_user_id,
      article.imported_at,
      article.source_revision_id ?? null,
      article.article_score,
      article.article_summary,
      article.status
    ]
  );
  return rowToArticle(result.rows[0]);
}

export async function addAnnotation(annotation: Annotation, refs: Reference[]) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const annotationResult = await client.query<AnnotationRow>(
      `
        INSERT INTO annotations (
          id, article_id, selected_text, start_offset, end_offset, section_title,
          paragraph_index, sentence_index, selection_scope, classification, annotation_score,
          comment, created_by_user_id, created_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `,
      [
        annotation.id,
        annotation.article_id,
        annotation.selected_text,
        annotation.start_offset,
        annotation.end_offset,
        annotation.section_title,
        annotation.paragraph_index,
        annotation.sentence_index,
        annotation.selection_scope,
        annotation.classification,
        annotation.annotation_score,
        annotation.comment,
        annotation.created_by_user_id,
        annotation.created_at,
        annotation.status
      ]
    );
    const savedRefs: Reference[] = [];
    for (const ref of refs) savedRefs.push(await insertReference(client, ref));
    await client.query("COMMIT");
    return { annotation: rowToAnnotation(annotationResult.rows[0]), references: savedRefs };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateArticleScore(articleId: string, score: Article["article_score"], summary: string) {
  await ensureSchema();
  const result = await pool.query<ArticleRow>(
    "UPDATE articles SET article_score = $2, article_summary = $3 WHERE id = $1 RETURNING *",
    [articleId, score, summary]
  );
  if (!result.rowCount) throw new Error("Article not found");
  return rowToArticle(result.rows[0]);
}

export async function updateAnnotationStatus(annotationId: string, status: Annotation["status"]) {
  await ensureSchema();
  const result = await pool.query<AnnotationRow>("UPDATE annotations SET status = $2 WHERE id = $1 RETURNING *", [
    annotationId,
    status
  ]);
  if (!result.rowCount) throw new Error("Annotation not found");
  return rowToAnnotation(result.rows[0]);
}

export async function updateAllowedDomains(domains: string[]) {
  await ensureSchema();
  const normalized = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .filter((domain, index, all) => all.indexOf(domain) === index);
  const nextDomains = normalized.length ? normalized : ["wikipedia.org", "britannica.com"];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM allowed_domains");
    for (const domain of nextDomains) {
      await client.query("INSERT INTO allowed_domains (domain) VALUES ($1) ON CONFLICT DO NOTHING", [domain]);
    }
    await client.query("COMMIT");
    return nextDomains;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function insertReference(client: PoolClient, ref: Reference) {
  const result = await client.query<ReferenceRow>(
    `
      INSERT INTO annotation_references (
        id, annotation_id, url, title, source_name, quote_or_summary, added_by_user_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      ref.id,
      ref.annotation_id,
      ref.url,
      ref.title,
      ref.source_name,
      ref.quote_or_summary,
      ref.added_by_user_id,
      ref.created_at
    ]
  );
  return rowToReference(result.rows[0]);
}

type ArticleRow = Omit<Article, "structured_content_json"> & { structured_content_json: Article["structured_content_json"] | string };
type AnnotationRow = Annotation;
type ReferenceRow = Reference;
type UserRow = User;

function rowToArticle(row: ArticleRow): Article {
  return {
    ...row,
    imported_at: new Date(row.imported_at).toISOString(),
    structured_content_json:
      typeof row.structured_content_json === "string" ? JSON.parse(row.structured_content_json) : row.structured_content_json
  };
}

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    ...row,
    selection_scope: row.selection_scope ?? "sentence",
    annotation_score: row.annotation_score ?? "Unreviewed",
    created_at: new Date(row.created_at).toISOString()
  };
}

function rowToReference(row: ReferenceRow): Reference {
  return { ...row, created_at: new Date(row.created_at).toISOString() };
}

function rowToUser(row: UserRow): User {
  return row;
}
