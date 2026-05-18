import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addAnnotation,
  pool,
  readDb,
  resetDb,
  updateAllowedDomains,
  updateAnnotationStatus,
  updateArticleScore,
  upsertArticle
} from "../../lib/db";
import type { Annotation, Article, Reference } from "../../lib/types";

const article: Article = {
  id: "article_test",
  source_url: "https://en.wikipedia.org/wiki/Test",
  canonical_url: "https://en.wikipedia.org/wiki/Test",
  source_site: "en.wikipedia.org",
  title: "Test",
  raw_html: "<p>Stored article text.</p>",
  cleaned_text: "Stored article text.",
  structured_content_json: [
    {
      title: "Introduction",
      paragraphs: [
        {
          text: "Stored article text.",
          start_offset: 0,
          end_offset: 20,
          sentences: [{ text: "Stored article text.", start_offset: 0, end_offset: 20 }]
        }
      ]
    }
  ],
  imported_by_user_id: "user-admin",
  imported_at: "2026-05-16T00:00:00.000Z",
  source_revision_id: "123",
  article_score: "Unreviewed",
  article_summary: "",
  status: "active"
};

describe("postgres data layer", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores article snapshots and updates score separately", async () => {
    await upsertArticle(article);
    await updateArticleScore(article.id, "Partly true", "Reviewed by admin.");
    const db = await readDb();

    expect(db.articles).toHaveLength(1);
    expect(db.articles[0].title).toBe("Test");
    expect(db.articles[0].article_score).toBe("Partly true");
    expect(db.articles[0].structured_content_json[0].paragraphs[0].sentences[0].start_offset).toBe(0);
  });

  it("stores annotations with multiple references and moderation status", async () => {
    await upsertArticle(article);
    const annotation: Annotation = {
      id: "annotation_test",
      article_id: article.id,
      selected_text: "Stored article text.",
      start_offset: 0,
      end_offset: 20,
      section_title: "Introduction",
      paragraph_index: 0,
      sentence_index: 0,
      selection_scope: "sentence",
      classification: "Needs citation",
      annotation_score: "Partly true",
      comment: "Needs stronger sourcing.",
      created_by_user_id: "user-reviewer",
      created_at: "2026-05-16T00:00:00.000Z",
      status: "pending"
    };
    const refs: Reference[] = [
      {
        id: "reference_1",
        annotation_id: annotation.id,
        url: "https://example.com/a",
        title: "Reference A",
        source_name: "Example",
        quote_or_summary: "Evidence A",
        added_by_user_id: "user-reviewer",
        created_at: "2026-05-16T00:00:00.000Z"
      },
      {
        id: "reference_2",
        annotation_id: annotation.id,
        url: "https://example.com/b",
        title: "Reference B",
        source_name: "Example",
        quote_or_summary: "Evidence B",
        added_by_user_id: "user-reviewer",
        created_at: "2026-05-16T00:00:00.000Z"
      }
    ];

    await addAnnotation(annotation, refs);
    await updateAnnotationStatus(annotation.id, "approved");
    const db = await readDb();

    expect(db.annotations[0].status).toBe("approved");
    expect(db.annotations[0].annotation_score).toBe("Partly true");
    expect(db.references).toHaveLength(2);
  });

  it("updates the source allowlist", async () => {
    await updateAllowedDomains(["wikipedia.org", "britannica.com", "wikipedia.org"]);
    const db = await readDb();

    expect(db.allowed_domains).toEqual(["britannica.com", "wikipedia.org"]);
  });
});
