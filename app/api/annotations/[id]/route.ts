import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateAnnotationStatus } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireRole(request, "admin");
    if (access.response) return access.response;
    const { id } = await params;
    const { status } = (await request.json()) as { status?: "pending" | "approved" | "hidden" };
    if (!status || !["pending", "approved", "hidden"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const annotation = await updateAnnotationStatus(id, status);
    return NextResponse.json({ annotation });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}
