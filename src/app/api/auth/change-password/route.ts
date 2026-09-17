import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  validateSession,
  invalidateAllUserSessions,
  createSession,
  setSessionCookie,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Mật khẩu mới phải có tối thiểu 8 ký tự" },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "Mật khẩu mới không được trùng với mật khẩu cũ" },
        { status: 400 }
      );
    }

    const sessionId = request.cookies.get("auth_session")?.value;
    if (!sessionId) {
      return NextResponse.json(
        { error: "Chưa đăng nhập hoặc phiên đã hết hạn" },
        { status: 401 }
      );
    }

    const sessionData = await validateSession(sessionId);
    if (!sessionData) {
      return NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ" },
        { status: 401 }
      );
    }

    const { user } = sessionData;

    // Kiểm tra mật khẩu hiện tại (hoặc mật khẩu tạm)
    const isOldPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      return NextResponse.json(
        { error: "Mật khẩu hiện tại không chính xác" },
        { status: 400 }
      );
    }

    // Băm mật khẩu mới
    const newPasswordHash = await hashPassword(newPassword);

    // Cập nhật Database: gỡ cờ mustChangePassword, ghi nhận thời gian đổi
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Thu hồi tất cả phiên đăng nhập cũ
    await invalidateAllUserSessions(user.id);

    // Khởi tạo phiên mới chính thức
    const ip =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      undefined;
    const ua = request.headers.get("user-agent") ?? undefined;
    const newSession = await createSession(user.id, ip, ua);
    await setSessionCookie(newSession.id, newSession.expiresAt);

    await logAudit({
      userId: user.id,
      action: "CHANGE_PASSWORD_SUCCESS",
      entityType: "users",
      entityId: user.id.toString(),
      ipAddress: ip ?? null,
    });

    return NextResponse.json({
      success: true,
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    console.error("[/api/auth/change-password]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi đổi mật khẩu" }, { status: 500 });
  }
}
