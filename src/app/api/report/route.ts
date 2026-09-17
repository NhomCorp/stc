import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSnapshots } from "@/db/schema";
import { type ReportSummary } from "@/lib/reports";

const SNAPSHOT_KEY = "bao_cao_v2";

export async function GET() {
  try {
    const [row] = await db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.key, SNAPSHOT_KEY))
      .limit(1);

    if (!row) {
      const empty: ReportSummary = {
        key: SNAPSHOT_KEY,
        updatedAt: null,
        today: null,
        months: [],
        syncedAt: null,
      };
      return NextResponse.json(empty);
    }

    const payload = row.payload as Omit<ReportSummary, "syncedAt" | "key">;
    return NextResponse.json({
      key: SNAPSHOT_KEY,
      updatedAt: payload.updatedAt ?? null,
      today: payload.today ?? null,
      months: Array.isArray(payload.months) ? payload.months : [],
      syncedAt: row.syncedAt?.toISOString() ?? null,
    } satisfies ReportSummary);
  } catch (error) {
    console.error("[/api/report GET]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}