import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRequestRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (process.env.E2E_ALLOW_RESET === "1") {
    return NextResponse.json({ authenticated: true, role: await getRequestRole(request) });
  }

  const session = await auth();
  return NextResponse.json({ authenticated: Boolean(session.userId), role: await getRequestRole(request) });
}
