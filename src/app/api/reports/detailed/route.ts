import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transactions, categories, customers, wallets } from "@/db/schema";
import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { requireUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions = [];
  if (from) conditions.push(gte(transactions.txDate, new Date(from)));
  if (to) conditions.push(lte(transactions.txDate, new Date(to)));
  
  const where = conditions.length ? and(...conditions) : undefined;

  try {
    // 1. Categories pie chart (chi)
    const categoryStats = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        amount: sql<number>`sum(${transactions.amount})::numeric`,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where ? and(where, eq(transactions.txType, "chi")) : eq(transactions.txType, "chi"))
      .groupBy(transactions.categoryId, categories.name)
      .orderBy(desc(sql`sum(${transactions.amount})`));

    // 2. Cashflow by date
    const dailyFlow = await db
      .select({
        date: sql<string>`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        txType: transactions.txType,
        amount: sql<number>`sum(${transactions.amount})::numeric`,
      })
      .from(transactions)
      .where(where)
      .groupBy(sql`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, transactions.txType)
      .orderBy(sql`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

    // 3. Top 5 customers (chi)
    const topCustomers = await db
      .select({
        customerId: transactions.customerId,
        customerName: customers.name,
        amount: sql<number>`sum(${transactions.amount})::numeric`,
      })
      .from(transactions)
      .leftJoin(customers, eq(transactions.customerId, customers.id))
      .where(where ? and(where, eq(transactions.txType, "chi")) : eq(transactions.txType, "chi"))
      .groupBy(transactions.customerId, customers.name)
      .orderBy(desc(sql`sum(${transactions.amount})`))
      .limit(5);

    // 4. Wallet flow (thu, chi per wallet)
    const walletFlow = await db
      .select({
        walletId: transactions.walletId,
        walletName: wallets.name,
        txType: transactions.txType,
        amount: sql<number>`sum(${transactions.amount})::numeric`,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .where(where)
      .groupBy(transactions.walletId, wallets.name, transactions.txType)
      .orderBy(wallets.name);

    return NextResponse.json({
      categoryStats: categoryStats.map(c => ({ ...c, amount: Number(c.amount) })),
      dailyFlow: dailyFlow.map(d => ({ ...d, amount: Number(d.amount) })),
      topCustomers: topCustomers.map(c => ({ ...c, amount: Number(c.amount) })),
      walletFlow: walletFlow.map(w => ({ ...w, amount: Number(w.amount) })),
    });
  } catch (error) {
    console.error("Failed to load detailed report", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
