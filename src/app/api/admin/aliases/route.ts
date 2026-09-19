import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { aliases } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
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

    const items = await db.select().from(aliases).orderBy(asc(aliases.keyword));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/admin/aliases]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    if (!body.keyword || !body.type || !body.targetName) {
      return NextResponse.json({ error: "Thiếu dữ liệu bắt buộc" }, { status: 400 });
    }

    const [item] = await db.insert(aliases).values({
      keyword: body.keyword.trim(),
      type: body.type,
      targetName: body.targetName.trim(),
    }).returning();

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/admin/aliases]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    const updates: any = {};
    if (body.keyword) updates.keyword = body.keyword.trim();
    if (body.type) updates.type = body.type;
    if (body.targetName) updates.targetName = body.targetName.trim();
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

    const [item] = await db.update(aliases).set(updates).where(eq(aliases.id, body.id)).returning();
    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("[PUT /api/admin/aliases]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    await db.delete(aliases).where(eq(aliases.id, parseInt(id, 10)));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/admin/aliases]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
