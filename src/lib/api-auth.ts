import { NextRequest } from "next/server";
import type { InferSelectModel } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { users } from "@/db/schema";

export type AuthUser = InferSelectModel<typeof users>;

export async function requireUser(request: NextRequest): Promise<AuthUser | null> {
  const sessionId = request.cookies.get("auth_session")?.value;
  if (!sessionId) return null;
  const sessionData = await validateSession(sessionId);
  if (!sessionData || sessionData.user.status !== "active") return null;
  return sessionData.user;
}

export async function requireAdmin(request: NextRequest): Promise<AuthUser | null> {
  const user = await requireUser(request);
  if (!user || user.role !== "admin") return null;
  return user;
}
