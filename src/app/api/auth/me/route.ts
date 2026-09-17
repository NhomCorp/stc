import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("auth_session")?.value;
    if (!sessionId) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const sessionData = await validateSession(sessionId);
    if (!sessionData) {
      return NextResponse.json({ error: "Phiên không hợp lệ hoặc đã hết hạn" }, { status: 401 });
    }

    const { user } = sessionData;

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        passwordChangedAt: user.passwordChangedAt,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[/api/auth/me]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
