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

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const conditions = [];
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

  const [rows, countRow] = await Promise.all([
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
  ]);

  return NextResponse.json({
    total: countRow[0]?.count ?? 0,
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
