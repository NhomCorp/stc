import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  validateSession,
  generateTemporaryPassword,
  hashPassword,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function verifyAdmin(request: NextRequest) {
  const sessionId = request.cookies.get("auth_session")?.value;
  if (!sessionId) return null;

  const sessionData = await validateSession(sessionId);
  if (!sessionData || sessionData.user.role !== "admin") return null;

  return sessionData.user;
}

/**
 * GET: Lấy danh sách tài khoản
 */
export async function GET(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Quyền truy cập bị từ chối (chỉ dành cho Admin)" }, { status: 403 });
    }

    const userList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        passwordChangedAt: users.passwordChangedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ users: userList });
  } catch (error) {
    console.error("[GET /api/admin/users]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi tải danh sách user" }, { status: 500 });
  }
}

/**
 * POST: Tạo tài khoản mới & cấp mật khẩu tạm
 */
export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Quyền truy cập bị từ chối (chỉ dành cho Admin)" }, { status: 403 });
    }

    const body = await request.json();
    const { username, fullName, email, role, customTempPassword } = body;

    if (!username || !username.trim()) {
      return NextResponse.json({ error: "Tên đăng nhập không được để trống" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Kiểm tra trùng username
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername));

    if (existing) {
      return NextResponse.json({ error: "Tên đăng nhập đã tồn tại" }, { status: 400 });
    }

    // Sinh mật khẩu tạm nếu không nhập tuỳ biến
    const tempPassword = customTempPassword && customTempPassword.trim().length >= 6
      ? customTempPassword.trim()
      : generateTemporaryPassword(10);

    const passwordHash = await hashPassword(tempPassword);

    const [newUser] = await db
      .insert(users)
      .values({
        username: cleanUsername,
        fullName: fullName ? fullName.trim() : null,
        email: email ? email.trim().toLowerCase() : null,
        role: role === "admin" ? "admin" : "member",
        status: "active",
        passwordHash,
        mustChangePassword: true,
      })
      .returning({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        createdAt: users.createdAt,
      });

    await logAudit({
      userId: adminUser.id,
      action: "ADMIN_CREATE_USER",
      entityType: "users",
      entityId: newUser.id.toString(),
      details: { createdUsername: newUser.username, role: newUser.role },
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    });

    return NextResponse.json({
      success: true,
      user: newUser,
      temporaryPassword: tempPassword,
    });
  } catch (error) {
    console.error("[POST /api/admin/users]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi tạo tài khoản" }, { status: 500 });
  }
}
