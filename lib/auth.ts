import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const ROLES = ["visitor", "reviewer", "admin"] as const;
export type AppRole = (typeof ROLES)[number];

const roleRank: Record<AppRole, number> = {
  visitor: 0,
  reviewer: 1,
  admin: 2
};

export function canAccess(role: AppRole, required: AppRole) {
  return roleRank[role] >= roleRank[required];
}

export async function getRequestRole(request: Request): Promise<AppRole> {
  const testRole = request.headers.get("x-test-role");
  if (process.env.E2E_ALLOW_RESET === "1" && isRole(testRole)) return testRole;
  if (process.env.E2E_ALLOW_RESET === "1") return "visitor";

  const session = await auth();
  const metadata = session.sessionClaims?.publicMetadata as { role?: unknown } | undefined;
  const role = metadata?.role;
  if (isRole(role)) return role;

  const user = session.userId ? await currentUser() : null;
  const userRole = user?.publicMetadata?.role;
  if (isRole(userRole)) return userRole;

  return isRole(role) ? role : "visitor";
}

export async function requireRole(request: Request, required: Exclude<AppRole, "visitor">) {
  const role = await getRequestRole(request);
  if (canAccess(role, required)) return { role };

  return {
    role,
    response: NextResponse.json({ error: `${required} role required` }, { status: role === "visitor" ? 401 : 403 })
  };
}

function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && ROLES.includes(value as AppRole);
}
