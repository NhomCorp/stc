import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq, or, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "auth_session";
const SESSION_EXPIRATION_DAYS = 7;

/**
 * 1. Băm mật khẩu (Hash)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * 2. Xác thực mật khẩu
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 3. Sinh mật khẩu tạm ngẫu nhiên
 */
export function generateTemporaryPassword(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  // Ensure at least one uppercase, one lowercase, one number, one special char
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)];
  password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
  password += "0123456789"[Math.floor(Math.random() * 10)];
  password += "!@#$%^&*"[Math.floor(Math.random() * 8)];
  
  for (let i = password.length; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  // Shuffle string
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * 4. Quản lý Session & Cookie
 */
export function generateSessionToken(): string {
  // Use a secure random token
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(userId: number, ipAddress?: string, userAgent?: string) {
  const sessionId = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
      ipAddress,
      userAgent,
    })
    .returning();

  return session;
}

export async function invalidateSession(sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Lấy & Xác thực session từ Database dựa trên sessionId
 */
export async function validateSession(sessionId: string) {
  const result = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));

  if (result.length === 0) return null;
  const { session, user } = result[0];

  // Nếu session hết hạn -> xóa và trả null
  if (session.expiresAt.getTime() <= Date.now()) {
    await invalidateSession(sessionId);
    return null;
  }

  // Nếu session còn dưới 3 ngày thì tự động gia hạn thêm
  const REFRESH_THRESHOLD = 3 * 24 * 60 * 60 * 1000;
  if (session.expiresAt.getTime() - Date.now() < REFRESH_THRESHOLD) {
    const newExpiresAt = new Date(Date.now() + SESSION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, sessionId));
    session.expiresAt = newExpiresAt;
  }

  return { session, user };
}

/**
 * Thao tác Cookie trong Route Handlers / Server Components
 */
export async function setSessionCookie(sessionId: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Lấy User hiện tại trực tiếp từ Cookie (dùng cho API và Server Components)
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const validSession = await validateSession(sessionId);
  if (!validSession) return null;

  return validSession.user;
}
