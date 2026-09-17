import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportSnapshots } from "@/db/schema";
import { parseSyncPayload, type ReportSummary } from "@/lib/reports";
import { getCurrentUser } from "@/lib/auth";

const SNAPSHOT_KEY = "bao_cao_v2";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    console.error("[/api/reports/summary GET]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.REPORT_SYNC_SECRET || "";
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-report-sync-secret") || "";

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const summary = parseSyncPayload(body);
    const now = new Date();

    await db
      .insert(reportSnapshots)
      .values({
        key: SNAPSHOT_KEY,
        payload: {
          updatedAt: summary.updatedAt,
          today: summary.today,
          months: summary.months,
        },
        syncedAt: now,
      })
      .onConflictDoUpdate({
        target: reportSnapshots.key,
        set: {
          payload: {
            updatedAt: summary.updatedAt,
            today: summary.today,
            months: summary.months,
          },
          syncedAt: now,
        },
      });

    return NextResponse.json({
      success: true,
      syncedAt: now.toISOString(),
      today: summary.today,
      months: summary.months,
    });
  } catch (error) {
    console.error("[/api/reports/summary POST]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}
