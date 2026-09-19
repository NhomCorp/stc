import { NextResponse } from "next/server";
import { aggregateTransactionReport } from "@/lib/report-aggregation";

export async function GET() {
  try {
    const summary = await aggregateTransactionReport();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[/api/report GET]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống" }, { status: 500 });
  }
}