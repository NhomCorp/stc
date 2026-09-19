import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aiLessons } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

async function verifyAdmin(request: NextRequest) {
  const sessionId = request.cookies.get("auth_session")?.value;
  if (!sessionId) return null;

  const sessionData = await validateSession(sessionId);
  if (!sessionData || sessionData.user.role !== "admin") return null;

  return sessionData.user;
}

export async function GET(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const items = await db.select().from(aiLessons).orderBy(desc(aiLessons.updatedAt)).limit(100);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/admin/ai-lessons]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    await db.delete(aiLessons).where(eq(aiLessons.id, parseInt(id, 10)));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/admin/ai-lessons]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
