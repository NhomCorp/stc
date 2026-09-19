import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql, and, gte, lte, or, ilike } from "drizzle-orm";
import { db } from "@/db";
import {
  transactions,
  customers,
  wallets,
  categories,
} from "@/db/schema";
import { requireUser } from "@/lib/api-auth";

function triggerBackgroundCleanup() {
  // Dọn ngầm ảnh Base64 cũ quá 45 ngày
  // Không cần await để tránh block request hiện tại
  db.execute(sql`
    UPDATE transactions 
    SET raw_data = raw_data - '_imageBase64' - '_imageMimeType'
    WHERE tx_date < NOW() - INTERVAL '45 days'
      AND raw_data ? '_imageBase64'
  `).catch(err => console.error("Auto cleanup background error:", err));
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  triggerBackgroundCleanup();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
  const txType = searchParams.get("type"); // thu | chi
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const amountMin = searchParams.get("amountMin");
  const amountMax = searchParams.get("amountMax");
  const customerId = searchParams.get("customerId");
  const walletId = searchParams.get("walletId");
  const categoryId = searchParams.get("categoryId");
  const status = searchParams.get("status");
  const sourceSheet = searchParams.get("sourceSheet");
  const q = (searchParams.get("q") || "").trim();
  const idStr = searchParams.get("id");

  const conditions = [];
  if (idStr) {
    const id = Number(idStr);
    if (!Number.isNaN(id) && id > 0) {
      conditions.push(eq(transactions.id, id));
    }
  }
  if (txType === "thu" || txType === "chi") {
    conditions.push(eq(transactions.txType, txType));
  }
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) conditions.push(gte(transactions.txDate, d));
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) conditions.push(lte(transactions.txDate, d));
  }
  const minAmount = amountMin ? Number(amountMin) : NaN;
  const maxAmount = amountMax ? Number(amountMax) : NaN;
  const customer = customerId ? Number(customerId) : NaN;
  const wallet = walletId ? Number(walletId) : NaN;
  const category = categoryId ? Number(categoryId) : NaN;
  if (Number.isFinite(minAmount)) {
    conditions.push(gte(transactions.amount, String(minAmount)));
  }
  if (Number.isFinite(maxAmount)) {
    conditions.push(lte(transactions.amount, String(maxAmount)));
  }
  if (Number.isInteger(customer) && customer > 0) {
    conditions.push(eq(transactions.customerId, customer));
  }
  if (Number.isInteger(wallet) && wallet > 0) {
    conditions.push(eq(transactions.walletId, wallet));
  }
  if (Number.isInteger(category) && category > 0) {
    conditions.push(eq(transactions.categoryId, category));
  }
  if (status) {
    conditions.push(eq(transactions.status, status));
  }
  if (sourceSheet) {
    conditions.push(eq(transactions.sourceSheet, sourceSheet));
  }
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(
        ilike(transactions.note, pattern),
        ilike(transactions.sourceSheet, pattern),
        ilike(customers.name, pattern),
        ilike(wallets.name, pattern),
        ilike(categories.name, pattern),
      ),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, countRow, sumRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        txDate: transactions.txDate,
        txType: transactions.txType,
        amount: transactions.amount,
        note: transactions.note,
        status: transactions.status,
        sourceSheet: transactions.sourceSheet,
        sourceKeyHash: transactions.sourceKeyHash,
        customerId: transactions.customerId,
        walletId: transactions.walletId,
        categoryId: transactions.categoryId,
        customerName: customers.name,
        walletName: wallets.name,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.txDate), desc(transactions.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where),
    db
      .select({
        txType: transactions.txType,
        total: sql<number>`sum(${transactions.amount})::numeric`,
      })
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .groupBy(transactions.txType),
  ]);

  let totalIncome = 0;
  let totalExpense = 0;
  for (const row of sumRows) {
    if (row.txType === "thu") totalIncome = Number(row.total);
    if (row.txType === "chi") totalExpense = Number(row.total);
  }

  return NextResponse.json({
    total: countRow[0]?.count ?? 0,
    totalIncome,
    totalExpense,
    limit,
    offset,
    items: rows,
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const txType = body.txType === "thu" || body.txType === "chi" ? body.txType : null;
  const amount = Number(body.amount);
  const txDate = body.txDate ? new Date(body.txDate) : null;

  if (!txType || !txDate || Number.isNaN(txDate.getTime()) || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Thiếu hoặc sai ngày / loại / số tiền" }, { status: 400 });
  }

  const sourceKeyHash = `MAN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const [row] = await db
    .insert(transactions)
    .values({
      sourceSheet: "manual",
      sourceKeyHash,
      txDate,
      txType,
      amount: amount.toFixed(2),
      customerId: body.customerId ? Number(body.customerId) : null,
      walletId: body.walletId ? Number(body.walletId) : null,
      categoryId: body.categoryId ? Number(body.categoryId) : null,
      note: body.note ? String(body.note).trim() : null,
      status: "valid",
      rawData: body,
    })
    .returning();

  return NextResponse.json({ item: row }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Thiếu hoặc sai id giao dịch" }, { status: 400 });
  }

  const patch: Partial<typeof transactions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.txType !== undefined) {
    if (body.txType !== "thu" && body.txType !== "chi") {
      return NextResponse.json({ error: "Loại giao dịch phải là thu hoặc chi" }, { status: 400 });
    }
    patch.txType = body.txType;
  }

  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Số tiền không hợp lệ" }, { status: 400 });
    }
    patch.amount = amount.toFixed(2);
  }

  if (body.txDate !== undefined) {
    const txDate = new Date(body.txDate);
    if (Number.isNaN(txDate.getTime())) {
      return NextResponse.json({ error: "Ngày giao dịch không hợp lệ" }, { status: 400 });
    }
    patch.txDate = txDate;
  }

  if (body.customerId !== undefined) {
    patch.customerId = body.customerId ? Number(body.customerId) : null;
  }
  if (body.walletId !== undefined) {
    patch.walletId = body.walletId ? Number(body.walletId) : null;
  }
  if (body.categoryId !== undefined) {
    patch.categoryId = body.categoryId ? Number(body.categoryId) : null;
  }
  if (body.note !== undefined) {
    patch.note = body.note ? String(body.note).trim() : null;
  }
  if (body.status !== undefined) {
    const newStatus = String(body.status);
    patch.status = newStatus;
    
    // (Tạm thời không xóa ảnh khi duyệt valid để lưu trữ theo yêu cầu)
  }
  if (body.rawData !== undefined) {
    patch.rawData = body.rawData;
  }

  const [updatedRow] = await db
    .update(transactions)
    .set(patch)
    .where(eq(transactions.id, id))
    .returning();

  if (!updatedRow) {
    return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });
  }

  return NextResponse.json({ item: updatedRow });
}

export async function DELETE(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Thiếu hoặc sai id giao dịch" }, { status: 400 });
  }

  const [deletedRow] = await db
    .delete(transactions)
    .where(eq(transactions.id, id))
    .returning();

  if (!deletedRow) {
    return NextResponse.json({ error: "Không tìm thấy giao dịch" }, { status: 404 });
  }

  return NextResponse.json({ success: true, item: deletedRow });
}

