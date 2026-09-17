import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Thiếu tên đăng nhập hoặc mật khẩu" },
        { status: 400 }
      );
    }

    // Tìm user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username.trim()));

    if (!user) {
      return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu" }, { status: 401 });
    }

    // Kiểm tra trạng thái tài khoản
    if (user.status === "locked") {
      return NextResponse.json({ error: "Tài khoản đã bị khóa, liên hệ admin" }, { status: 403 });
    }

    // Xác thực mật khẩu
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      await logAudit({
        userId: user.id,
        action: "LOGIN_FAILED",
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      });
      return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu" }, { status: 401 });
    }

    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      undefined;
    const ua = request.headers.get("user-agent") ?? undefined;

    const session = await createSession(user.id, ip, ua);
    await setSessionCookie(session.id, session.expiresAt);

    await logAudit({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      ipAddress: ip ?? null,
    });

    return NextResponse.json({
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error("[/api/auth/login]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
