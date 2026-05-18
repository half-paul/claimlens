import { NextRequest, NextResponse } from "next/server";
import { readDb, upsertArticle } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { importWikipediaArticle } from "@/lib/ingest";
import { findArticles } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const db = await readDb();
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const articles = findArticles(db.articles, query);
  return NextResponse.json({ articles });
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, "admin");
    if (access.response) return access.response;
    const db = await readDb();
    const { url } = (await request.json()) as { url?: string };
    if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
    const article = await importWikipediaArticle(url, db.allowed_domains);
    await upsertArticle(article);
    return NextResponse.json({ article });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
