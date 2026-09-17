import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, wallets, categories, categoryGroups } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/api-auth";

type MasterKind = "customers" | "wallets" | "categories" | "category_groups";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kind = (new URL(request.url).searchParams.get("kind") || "customers") as MasterKind;
  if (!["customers", "wallets", "categories", "category_groups"].includes(kind)) {
    return NextResponse.json({ error: "kind không hợp lệ" }, { status: 400 });
  }

  if (kind === "categories") {
    const items = await db
      .select({
        id: categories.id,
        name: categories.name,
        code: categories.code,
        isActive: categories.isActive,
        groupId: categories.groupId,
        groupName: categoryGroups.name,
        sortOrder: categories.sortOrder,
        createdAt: categories.createdAt,
      })
      .from(categories)
      .leftJoin(categoryGroups, eq(categories.groupId, categoryGroups.id))
      .orderBy(asc(categoryGroups.sortOrder), asc(categories.sortOrder), asc(categories.name));
    return NextResponse.json({ kind, items });
  }

  if (kind === "category_groups") {
    const items = await db
      .select()
      .from(categoryGroups)
      .orderBy(asc(categoryGroups.sortOrder), asc(categoryGroups.name));
    return NextResponse.json({ kind, items });
  }

  if (kind === "customers") {
    const items = await db
      .select()
      .from(customers)
      .orderBy(asc(customers.sortOrder), asc(customers.name));
    return NextResponse.json({ kind, items });
  }

  const items = await db
    .select()
    .from(wallets)
    .orderBy(asc(wallets.sortOrder), asc(wallets.name));
  return NextResponse.json({ kind, items });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  }

  const body = await request.json();
  const kind = body.kind as MasterKind;
  const name = String(body.name || "").trim();
  if (!name || !["customers", "wallets", "categories", "category_groups"].includes(kind)) {
    return NextResponse.json({ error: "Thiếu kind/name" }, { status: 400 });
  }

  try {
    if (kind === "categories") {
      const groupId = body.groupId ? Number(body.groupId) : null;
      const [item] = await db
        .insert(categories)
        .values({
          name,
          code: body.code || null,
          groupId: groupId && Number.isFinite(groupId) ? groupId : null,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
        })
        .returning();
      return NextResponse.json({ item }, { status: 201 });
    }

    if (kind === "category_groups") {
      const [item] = await db
        .insert(categoryGroups)
        .values({
          name,
          code: body.code || null,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
        })
        .returning();
      return NextResponse.json({ item }, { status: 201 });
    }

    if (kind === "customers") {
      const [item] = await db
        .insert(customers)
        .values({
          name,
          code: body.code || null,
          sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
        })
        .returning();
      return NextResponse.json({ item }, { status: 201 });
    }

    const [item] = await db
      .insert(wallets)
      .values({
        name,
        code: body.code || null,
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      })
      .returning();
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "Tên đã tồn tại" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  }

  const body = await request.json();
  const kind = body.kind as MasterKind;
  const id = Number(body.id);
  if (!id || !["customers", "wallets", "categories", "category_groups"].includes(kind)) {
    return NextResponse.json({ error: "Thiếu kind/id" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
  if (kind === "categories" && body.groupId !== undefined) {
    patch.groupId = body.groupId === null || body.groupId === "" ? null : Number(body.groupId);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Không có field cập nhật" }, { status: 400 });
  }

  try {
    if (kind === "categories") {
      const [item] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
      return NextResponse.json({ item });
    }
    if (kind === "category_groups") {
      const [item] = await db
        .update(categoryGroups)
        .set(patch)
        .where(eq(categoryGroups.id, id))
        .returning();
      return NextResponse.json({ item });
    }
    if (kind === "customers") {
      const [item] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
      return NextResponse.json({ item });
    }
    const [item] = await db.update(wallets).set(patch).where(eq(wallets.id, id)).returning();
    return NextResponse.json({ item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json({ error: "Tên đã tồn tại" }, { status: 409 });
    }
    throw err;
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Chỉ admin" }, { status: 403 });
  }

  const body = await request.json();
  const kind = body.kind as MasterKind;
  const orderedIds = body.orderedIds as number[];

  if (!Array.isArray(orderedIds) || !["customers", "wallets", "categories", "category_groups"].includes(kind)) {
    return NextResponse.json({ error: "Dữ liệu sắp xếp không hợp lệ" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index++) {
      const id = orderedIds[index];
      if (kind === "categories") {
        await tx.update(categories).set({ sortOrder: index }).where(eq(categories.id, id));
      } else if (kind === "category_groups") {
        await tx.update(categoryGroups).set({ sortOrder: index }).where(eq(categoryGroups.id, id));
      } else if (kind === "customers") {
        await tx.update(customers).set({ sortOrder: index }).where(eq(customers.id, id));
      } else if (kind === "wallets") {
        await tx.update(wallets).set({ sortOrder: index }).where(eq(wallets.id, id));
      }
    }
  });

  return NextResponse.json({ success: true, count: orderedIds.length });
}
