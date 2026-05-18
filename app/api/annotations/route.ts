import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { addAnnotation, makeId } from "@/lib/db";
import { ANNOTATION_CLASSIFICATIONS, ARTICLE_SCORES, type Annotation, type Reference } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const access = await requireRole(request, "reviewer");
    if (access.response) return access.response;
    const body = (await request.json()) as {
      article_id?: string;
      selected_text?: string;
      start_offset?: number;
      end_offset?: number;
      section_title?: string;
      paragraph_index?: number;
      sentence_index?: number | null;
      selection_scope?: Annotation["selection_scope"];
      classification?: string;
      annotation_score?: string;
      comment?: string;
      references?: Partial<Reference>[];
    };

    if (!body.article_id || !body.selected_text || body.start_offset === undefined || body.end_offset === undefined) {
      return NextResponse.json({ error: "Selection details are required" }, { status: 400 });
    }
    if (!ANNOTATION_CLASSIFICATIONS.includes(body.classification as never)) {
      return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
    }
    if (body.annotation_score && !ARTICLE_SCORES.includes(body.annotation_score as never)) {
      return NextResponse.json({ error: "Invalid annotation score" }, { status: 400 });
    }
    if (!body.comment?.trim()) return NextResponse.json({ error: "Comment is required" }, { status: 400 });

    const annotationId = makeId("annotation");
    const annotation: Annotation = {
      id: annotationId,
      article_id: body.article_id,
      selected_text: body.selected_text,
      start_offset: body.start_offset,
      end_offset: body.end_offset,
      section_title: body.section_title ?? "Introduction",
      paragraph_index: body.paragraph_index ?? 0,
      sentence_index: body.sentence_index ?? null,
      selection_scope: body.selection_scope ?? "sentence",
      classification: body.classification as never,
      annotation_score: (body.annotation_score as never) ?? "Unreviewed",
      comment: body.comment,
      created_by_user_id: "user-reviewer",
      created_at: new Date().toISOString(),
      status: "pending"
    };

    const refs: Reference[] = (body.references ?? [])
      .filter((ref) => ref.url)
      .map((ref) => ({
        id: makeId("reference"),
        annotation_id: annotationId,
        url: ref.url ?? "",
        title: ref.title ?? "",
        source_name: ref.source_name ?? "",
        quote_or_summary: ref.quote_or_summary ?? "",
        added_by_user_id: "user-reviewer",
        created_at: new Date().toISOString()
      }));

    const result = await addAnnotation(annotation, refs);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Annotation failed" }, { status: 400 });
  }
}
