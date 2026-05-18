import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateArticleScore } from "@/lib/db";
import { ARTICLE_SCORES } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDb();
  const article = db.articles.find((item) => item.id === id);
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  const annotations = db.annotations.filter((item) => item.article_id === id);
  const references = db.references.filter((ref) => annotations.some((annotation) => annotation.id === ref.annotation_id));
  return NextResponse.json({ article, annotations, references });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireRole(request, "admin");
    if (access.response) return access.response;
    const { id } = await params;
    const { article_score, article_summary } = (await request.json()) as {
      article_score?: string;
      article_summary?: string;
    };
    if (!ARTICLE_SCORES.includes(article_score as never)) {
      return NextResponse.json({ error: "Invalid article score" }, { status: 400 });
    }
    const article = await updateArticleScore(id, article_score as never, article_summary ?? "");
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}
