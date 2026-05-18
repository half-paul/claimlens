import { NextResponse } from "next/server";
import { resetDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.E2E_ALLOW_RESET !== "1") {
    return NextResponse.json({ error: "Reset endpoint is disabled" }, { status: 403 });
  }
  await resetDb();
  return NextResponse.json({ ok: true });
}
