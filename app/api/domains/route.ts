import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { readDb, updateAllowedDomains } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = await requireRole(request, "admin");
  if (access.response) return access.response;
  const db = await readDb();
  return NextResponse.json({ allowed_domains: db.allowed_domains });
}

export async function PATCH(request: Request) {
  const access = await requireRole(request, "admin");
  if (access.response) return access.response;
  const { allowed_domains } = (await request.json()) as { allowed_domains?: string[] };
  if (!allowed_domains) return NextResponse.json({ error: "Allowed domains are required" }, { status: 400 });
  return NextResponse.json({ allowed_domains: await updateAllowedDomains(allowed_domains) });
}
