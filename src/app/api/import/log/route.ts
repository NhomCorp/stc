import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { importLogRows, parseLogPaste, type LogRowInput } from "@/lib/import-log";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Chỉ admin được import" }, { status: 403 });
  }

  const body = await request.json();
  let rows: LogRowInput[] = [];

  if (Array.isArray(body.rows)) {
    rows = body.rows as LogRowInput[];
  } else if (typeof body.text === "string") {
    rows = parseLogPaste(body.text, body.sourceSheet || "paste_manual");
  } else {
    return NextResponse.json({ error: "Cần text (paste) hoặc rows (JSON)" }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Không có dòng nào để import" }, { status: 400 });
  }

  if (rows.length > 5000) {
    return NextResponse.json({ error: "Tối đa 5000 dòng / lần" }, { status: 400 });
  }

  const result = await importLogRows(rows, {
    sourceName: body.sourceName || rows[0]?.sourceSheet || "import",
  });

  await logAudit({
    userId: admin.id,
    action: "import_log",
    entityType: "sync_run",
    entityId: String(result.syncRunId),
    details: {
      totalRows: result.totalRows,
      validRows: result.validRows,
      duplicateRows: result.duplicateRows,
      errorRows: result.errorRows,
    },
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json(result);
}
