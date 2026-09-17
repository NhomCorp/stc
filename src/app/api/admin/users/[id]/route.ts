import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  validateSession,
  generateTemporaryPassword,
  hashPassword,
  invalidateAllUserSessions,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function verifyAdmin(request: NextRequest) {
  const sessionId = request.cookies.get("auth_session")?.value;
  if (!sessionId) return null;

  const sessionData = await validateSession(sessionId);
  if (!sessionData || sessionData.user.role !== "admin") return null;

  return sessionData.user;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Quyền truy cập bị từ chối" }, { status: 403 });
    }

    const { id } = await params;
    const targetUserId = parseInt(id, 10);
    if (isNaN(targetUserId)) {
      return NextResponse.json({ error: "ID người dùng không hợp lệ" }, { status: 400 });
    }

    const body = await request.json();
    const { action, status, role, fullName, email } = body;

    const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!targetUser) {
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    // 1. Reset mật khẩu tạm
    if (action === "reset_password") {
      const tempPassword = generateTemporaryPassword(10);
      const passwordHash = await hashPassword(tempPassword);

      await db
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

      // Hủy mọi phiên đăng nhập của người dùng này
      await invalidateAllUserSessions(targetUserId);

      await logAudit({
        userId: adminUser.id,
        action: "ADMIN_RESET_PASSWORD",
        entityType: "users",
        entityId: targetUserId.toString(),
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      });

      return NextResponse.json({
        success: true,
        message: "Đặt lại mật khẩu tạm thành công",
        temporaryPassword: tempPassword,
      });
    }

    // 2. Cập nhật thông tin thông thường (status, role, fullName, email)
    const updateData: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (status && (status === "active" || status === "locked")) {
      // Không cho admin tự khóa chính mình
      if (targetUserId === adminUser.id && status === "locked") {
        return NextResponse.json({ error: "Không thể tự khóa tài khoản của chính mình" }, { status: 400 });
      }
      updateData.status = status;
      if (status === "locked") {
        await invalidateAllUserSessions(targetUserId);
      }
    }

    if (role && (role === "admin" || role === "member")) {
      // Không cho admin tự hạ quyền chính mình
      if (targetUserId === adminUser.id && role !== "admin") {
        return NextResponse.json({ error: "Không thể tự hạ quyền của chính mình" }, { status: 400 });
      }
      updateData.role = role;
    }

    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;

    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, targetUserId))
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
      });

    await logAudit({
      userId: adminUser.id,
      action: "ADMIN_UPDATE_USER",
      entityType: "users",
      entityId: targetUserId.toString(),
      details: updateData as Record<string, unknown>,
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("[PATCH /api/admin/users/[id]]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi cập nhật user" }, { status: 500 });
  }
}
