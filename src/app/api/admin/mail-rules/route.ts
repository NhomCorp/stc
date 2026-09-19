import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mailRules } from "@/db/schema";
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

    const items = await db.select().from(mailRules).orderBy(asc(mailRules.keyword));
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/admin/mail-rules]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();

    // Support batch import / paste
    if (Array.isArray(body.items)) {
      let created = 0;
      let updated = 0;

      for (const item of body.items) {
        const keyword = item.keyword?.trim();
        if (!keyword) continue;

        const walletName = item.walletName?.trim() || null;
        const customerName = item.customerName?.trim() || null;
        const categoryName = item.categoryName?.trim() || null;
        const note = item.note?.trim() || null;

        const existing = await db.select().from(mailRules).where(eq(mailRules.keyword, keyword)).limit(1);
        if (existing.length > 0) {
          await db.update(mailRules).set({
            walletName,
            customerName,
            categoryName,
            note,
            updatedAt: new Date(),
          }).where(eq(mailRules.id, existing[0].id));
          updated++;
        } else {
          await db.insert(mailRules).values({
            keyword,
            walletName,
            customerName,
            categoryName,
            note,
          });
          created++;
        }
      }

      return NextResponse.json({ success: true, created, updated });
    }

    if (!body.keyword?.trim()) {
      return NextResponse.json({ error: "Thiếu keyword bắt buộc" }, { status: 400 });
    }

    const [item] = await db.insert(mailRules).values({
      keyword: body.keyword.trim(),
      walletName: body.walletName?.trim() || null,
      customerName: body.customerName?.trim() || null,
      categoryName: body.categoryName?.trim() || null,
      note: body.note?.trim() || null,
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    }).returning();

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/admin/mail-rules]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

    const updates: any = {
      updatedAt: new Date(),
    };
    if (typeof body.keyword === "string") updates.keyword = body.keyword.trim();
    if (typeof body.walletName === "string" || body.walletName === null) updates.walletName = body.walletName ? body.walletName.trim() : null;
    if (typeof body.customerName === "string" || body.customerName === null) updates.customerName = body.customerName ? body.customerName.trim() : null;
    if (typeof body.categoryName === "string" || body.categoryName === null) updates.categoryName = body.categoryName ? body.categoryName.trim() : null;
    if (typeof body.note === "string" || body.note === null) updates.note = body.note ? body.note.trim() : null;
    if (typeof body.isActive === "boolean") updates.isActive = body.isActive;

    const [item] = await db.update(mailRules).set(updates).where(eq(mailRules.id, body.id)).returning();
    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    console.error("[PUT /api/admin/mail-rules]:", error);
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

    await db.delete(mailRules).where(eq(mailRules.id, parseInt(id, 10)));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/admin/mail-rules]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
