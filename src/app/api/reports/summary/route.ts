import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { reportSnapshots } from "@/db/schema";
import { parseSyncPayload } from "@/lib/reports";
import { aggregateTransactionReport } from "@/lib/report-aggregation";
import { getCurrentUser } from "@/lib/auth";

const SNAPSHOT_KEY = "bao_cao_v2";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await aggregateTransactionReport();
    return NextResponse.json(summary);
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
