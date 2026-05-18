import type { Article } from "./types";

export function findArticles(articles: Article[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return articles;
  return articles.filter((article) => {
    return (
      article.title.toLowerCase().includes(normalized) ||
      article.source_url.toLowerCase().includes(normalized) ||
      article.cleaned_text.toLowerCase().includes(normalized)
    );
  });
}
