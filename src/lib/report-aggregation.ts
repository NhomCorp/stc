import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import type { ReportRow, ReportSummary } from "@/lib/reports";

const REPORT_KEY = "postgres_transactions";
const REPORT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const INCLUDED_STATUSES = ["valid", "warning"] as const;

const income = sql<number>`coalesce(sum(case when ${transactions.txType} = 'thu' then ${transactions.amount} else 0 end), 0)::numeric`;
const expense = sql<number>`coalesce(sum(case when ${transactions.txType} = 'chi' then ${transactions.amount} else 0 end), 0)::numeric`;
const checkCount = sql<number>`count(*) filter (where ${transactions.status} = 'warning')::int`;

function toReportRow(
  label: string,
  row?: { thu: number; chi: number; checkCount: number },
): ReportRow {
  const thu = Number(row?.thu ?? 0);
  const chi = Number(row?.chi ?? 0);
  return {
    label,
    thu,
    chi,
    rong: thu - chi,
    checkCount: Number(row?.checkCount ?? 0),
  };
}

/** Tổng hợp báo cáo trực tiếp từ giao dịch hợp lệ theo múi giờ Việt Nam. */
export async function aggregateTransactionReport(): Promise<ReportSummary> {
  const vietnamDate = sql`(${transactions.txDate} at time zone ${REPORT_TIME_ZONE})::date`;
  const vietnamMonth = sql`date_trunc('month', ${transactions.txDate} at time zone ${REPORT_TIME_ZONE})::date`;
  const todayInVietnam = sql`(now() at time zone ${REPORT_TIME_ZONE})::date`;
  const firstReportMonth = sql`(date_trunc('month', now() at time zone ${REPORT_TIME_ZONE}) - interval '2 months')::date`;

  const [todayRows, monthRows] = await Promise.all([
    db
      .select({ thu: income, chi: expense, checkCount })
      .from(transactions)
      .where(
        and(
          inArray(transactions.status, [...INCLUDED_STATUSES]),
          eq(vietnamDate, todayInVietnam),
        ),
      ),
    db
      .select({
        month: sql<string>`to_char(${vietnamMonth}, 'YYYY-MM-DD')`,
        label: sql<string>`'Tháng ' || to_char(${vietnamMonth}, 'MM/YYYY')`,
        thu: income,
        chi: expense,
        checkCount,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.status, [...INCLUDED_STATUSES]),
          sql`${vietnamMonth} >= ${firstReportMonth}`,
          sql`${vietnamMonth} <= date_trunc('month', now() at time zone ${REPORT_TIME_ZONE})::date`,
        ),
      )
      .groupBy(vietnamMonth)
      .orderBy(vietnamMonth),
  ]);

  const monthMap = new Map(monthRows.map((row) => [row.month, row]));
  const months = Array.from({ length: 3 }, (_, index) => {
    const date = new Date();
    const vietnamParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: REPORT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(date);
    const year = Number(vietnamParts.find((part) => part.type === "year")?.value);
    const month = Number(vietnamParts.find((part) => part.type === "month")?.value);
    const cursor = new Date(Date.UTC(year, month - 3 + index, 1));
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const row = monthMap.get(key);
    return toReportRow(row?.label ?? `Tháng ${key.slice(5, 7)}/${key.slice(0, 4)}`, row);
  });

  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: REPORT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);

  return {
    key: REPORT_KEY,
    updatedAt: now.toISOString(),
    today: toReportRow(todayLabel, todayRows[0]),
    months,
    syncedAt: null,
  };
}
