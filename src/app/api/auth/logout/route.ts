import { NextRequest, NextResponse } from "next/server";
import { invalidateSession, deleteSessionCookie } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("auth_session")?.value;
    if (sessionId) {
      await invalidateSession(sessionId);
    }

    await deleteSessionCookie();

    await logAudit({
      action: "LOGOUT",
      ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/auth/logout]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
