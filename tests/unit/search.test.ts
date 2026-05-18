import { describe, expect, it } from "vitest";
import { findArticles } from "../../lib/search";
import type { Article } from "../../lib/types";

const article = {
  id: "article_1",
  source_url: "https://en.wikipedia.org/wiki/Ada_Lovelace",
  canonical_url: "https://en.wikipedia.org/wiki/Ada_Lovelace",
  source_site: "en.wikipedia.org",
  title: "Ada Lovelace",
  raw_html: "",
  cleaned_text: "Mathematician and writer.",
  structured_content_json: [],
  imported_by_user_id: "user-admin",
  imported_at: "2026-05-16T00:00:00.000Z",
  article_score: "Unreviewed",
  article_summary: "",
  status: "active"
} satisfies Article;

describe("article search", () => {
  it("matches by title, URL, or cleaned text", () => {
    expect(findArticles([article], "lovelace")).toHaveLength(1);
    expect(findArticles([article], "wikipedia.org/wiki")).toHaveLength(1);
    expect(findArticles([article], "writer")).toHaveLength(1);
    expect(findArticles([article], "turing")).toHaveLength(0);
  });
});
