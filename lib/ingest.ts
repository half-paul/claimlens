import type { Article, Paragraph, Section, Sentence } from "./types";
import { makeId } from "./db";

type WikipediaParseResponse = {
  parse?: {
    title?: string;
    revid?: number;
    text?: { "*"?: string };
    sections?: { line: string; index: string }[];
  };
  error?: { info?: string };
};

const blockedSectionTitles = new Set([
  "references",
  "external links",
  "see also",
  "further reading",
  "notes",
  "bibliography"
]);

export function isAllowedSource(url: URL, allowedDomains: string[]) {
  const hostname = url.hostname.toLowerCase();
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function getSourceSite(url: URL) {
  return url.hostname.replace(/^www\./, "");
}

export async function importWikipediaArticle(sourceUrl: string, allowedDomains: string[]): Promise<Article> {
  const url = new URL(sourceUrl);
  if (!isAllowedSource(url, allowedDomains)) {
    throw new Error(`Only allowlisted encyclopedia domains can be imported. Current allowlist: ${allowedDomains.join(", ")}`);
  }
  if (url.hostname.includes("britannica.com")) return importBritannicaArticle(url);
  if (!url.hostname.includes("wikipedia.org")) {
    throw new Error("This MVP currently supports Wikipedia and Britannica imports only.");
  }

  const titleFromPath = decodeURIComponent(url.pathname.split("/wiki/")[1] ?? "").replaceAll("_", " ");
  if (!titleFromPath) throw new Error("Use a full Wikipedia article URL, such as https://en.wikipedia.org/wiki/Example.");

  const apiUrl = new URL(`${url.origin}/w/api.php`);
  apiUrl.search = new URLSearchParams({
    action: "parse",
    page: titleFromPath,
    prop: "text|sections|revid",
    format: "json",
    redirects: "1",
    origin: "*"
  }).toString();

  const response = await fetch(apiUrl, {
    headers: { "user-agent": "human-led-fact-check-mvp/0.1" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Wikipedia import failed with HTTP ${response.status}`);
  const data = (await response.json()) as WikipediaParseResponse;
  if (data.error) throw new Error(data.error.info ?? "Wikipedia import failed");

  const rawHtml = data.parse?.text?.["*"] ?? "";
  const title = data.parse?.title ?? titleFromPath;
  const structured = structureWikipediaHtml(rawHtml);
  const cleanedText = structured
    .flatMap((section) => [section.title, ...section.paragraphs.map((paragraph) => paragraph.text)])
    .filter(Boolean)
    .join("\n\n");

  return {
    id: makeId("article"),
    source_url: sourceUrl,
    canonical_url: `${url.origin}/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    source_site: getSourceSite(url),
    title,
    raw_html: rawHtml,
    cleaned_text: cleanedText,
    structured_content_json: structured,
    imported_by_user_id: "user-admin",
    imported_at: new Date().toISOString(),
    source_revision_id: data.parse?.revid ? String(data.parse.revid) : undefined,
    article_score: "Unreviewed",
    article_summary: "",
    status: "active"
  };
}

async function importBritannicaArticle(url: URL): Promise<Article> {
  const response = await fetch(url, {
    headers: { "user-agent": "human-led-fact-check-mvp/0.1" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Britannica import failed with HTTP ${response.status}`);

  const pageHtml = await response.text();
  const rawHtml = extractBritannicaArticleHtml(pageHtml);
  const title = extractTitle(pageHtml) ?? decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "Britannica article");
  const structured = structureWikipediaHtml(rawHtml);
  const cleanedText = structured
    .flatMap((section) => [section.title, ...section.paragraphs.map((paragraph) => paragraph.text)])
    .filter(Boolean)
    .join("\n\n");

  return {
    id: makeId("article"),
    source_url: url.toString(),
    canonical_url: url.toString().replace(/\/$/, ""),
    source_site: getSourceSite(url),
    title,
    raw_html: rawHtml,
    cleaned_text: cleanedText,
    structured_content_json: structured,
    imported_by_user_id: "user-admin",
    imported_at: new Date().toISOString(),
    article_score: "Unreviewed",
    article_summary: "",
    status: "active"
  };
}

export function structureWikipediaHtml(rawHtml: string): Section[] {
  const sections: Section[] = [{ title: "Introduction", paragraphs: [] }];
  let current: Section | null = sections[0];
  let offset = 0;

  const blocks = rawHtml
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .match(/<h2[\s\S]*?<\/h2>|<h3[\s\S]*?<\/h3>|<p[\s\S]*?<\/p>/gi) ?? [];

  for (const block of blocks) {
    if (/^<h[23]/i.test(block)) {
      const title = cleanHtml(block);
      if (title && blockedSectionTitles.has(title.toLowerCase())) {
        current = null;
      } else if (title) {
        current = { title, paragraphs: [] };
        sections.push(current);
      }
      continue;
    }

    if (!current) continue;
    const text = cleanHtml(block);
    if (text.length < 40) continue;

    const paragraph = makeParagraph(text, offset);
    current.paragraphs.push(paragraph);
    offset = paragraph.end_offset + 2;
  }

  return sections.filter((section) => section.paragraphs.length > 0);
}

function makeParagraph(text: string, start: number): Paragraph {
  return {
    text,
    start_offset: start,
    end_offset: start + text.length,
    sentences: splitSentences(text, start)
  };
}

function splitSentences(text: string, paragraphStart: number): Sentence[] {
  const matches = text.matchAll(/[^.!?]+(?:[.!?]+|$)(?:\s+|$)/g);
  const sentences = Array.from(matches)
    .map((match) => {
      const value = match[0].trim();
      const localStart = match.index ?? 0;
      return {
        text: value,
        start_offset: paragraphStart + localStart,
        end_offset: paragraphStart + localStart + value.length
      };
    })
    .filter((sentence) => sentence.text.length > 0);
  return sentences.length ? sentences : [{ text, start_offset: paragraphStart, end_offset: paragraphStart + text.length }];
}

function cleanHtml(html: string) {
  return html
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBritannicaArticleHtml(pageHtml: string) {
  const articleMatch = pageHtml.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) return articleMatch[0];

  const mainMatch = pageHtml.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) return mainMatch[0];

  const bodyMatch = pageHtml.match(/<body[\s\S]*?<\/body>/i);
  return bodyMatch?.[0] ?? pageHtml;
}

function extractTitle(pageHtml: string) {
  const h1 = pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const ogTitle = pageHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  return cleanHtml(h1 ?? ogTitle ?? "").replace(/ \| Britannica$/, "") || undefined;
}
