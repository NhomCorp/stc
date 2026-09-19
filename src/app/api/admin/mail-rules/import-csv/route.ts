import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailRules } from "@/db/schema";
import { requireAdmin } from "@/lib/api-auth";
import { importLogRows, type LogRowInput } from "@/lib/import-log";
import { logAudit } from "@/lib/audit";

function parseCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line, index) => {
    const cols = parseCsvLine(line);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => raw[h] = cols[i] ?? "");
    return { rowIndex: index + 2, raw, text: cols.join(" ") };
  });
}

function pick(raw: Record<string, string>, names: string[]) {
  const entries = Object.entries(raw);
  for (const name of names) {
    const found = entries.find(([key]) => key.toLowerCase().replace(/[\s_\-]/g, "").includes(name));
    if (found?.[1]) return found[1];
  }
  return "";
}

function parseAmount(raw: Record<string, string>) {
  const direct = pick(raw, ["amount", "total", "sotien", "cost", "paid", "charged"]);
  const candidates = direct ? [direct] : Object.values(raw);
  for (const value of candidates) {
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n) && n !== 0) return Math.abs(n);
  }
  return null;
}

function makeKey(fileName: string, rowIndex: number, raw: Record<string, string>) {
  const externalId = pick(raw, ["invoiceid", "transactionid", "paymentid", "receiptid", "id"]);
  if (externalId) return externalId.slice(0, 64);
  return createHash("sha256").update(`${fileName}|${rowIndex}|${JSON.stringify(raw)}`).digest("hex").slice(0, 64);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "Chỉ admin được import CSV" }, { status: 403 });

  const body = await request.json();
  const text = String(body.text || "");
  const fileName = String(body.fileName || "manual.csv");
  const commit = Boolean(body.commit);

  if (!text.trim()) return NextResponse.json({ error: "Chưa có nội dung CSV" }, { status: 400 });

  const rules = await db.select().from(mailRules).where(eq(mailRules.isActive, true)).orderBy(asc(mailRules.keyword));
  const csvRows = parseCsv(text);
  const preview = csvRows.map((row) => {
    const haystack = `${row.text} ${Object.values(row.raw).join(" ")}`.toLowerCase();
    const rule = rules.find((r) => haystack.includes(r.keyword.toLowerCase()));
    const amount = parseAmount(row.raw);
    const date = pick(row.raw, ["date", "ngay", "time", "created"]);
    const description = pick(row.raw, ["description", "memo", "note", "ghichu", "campaign", "account", "name"]);
    const uniqueKey = makeKey(fileName, row.rowIndex, row.raw);

    return {
      row: row.rowIndex,
      matched: Boolean(rule),
      keyword: rule?.keyword || null,
      date: date || null,
      amount,
      walletName: rule?.walletName || null,
      customerName: rule?.customerName || null,
      categoryName: rule?.categoryName || null,
      note: rule?.note || description || null,
      uniqueKey,
      status: rule && amount && date ? "OK" : "CHECK",
      raw: row.raw,
    };
  });

  if (!commit) {
    return NextResponse.json({
      totalRows: preview.length,
      matchedRows: preview.filter((r) => r.matched).length,
      readyRows: preview.filter((r) => r.status === "OK").length,
      rows: preview.slice(0, 200),
    });
  }

  const rows: LogRowInput[] = preview.filter((r) => r.status === "OK").map((r) => ({
    sourceSheet: `csv_manual:${fileName}`,
    sourceRowIndex: r.row,
    ngay: r.date,
    phanLoai: "Chi",
    soTien: r.amount,
    vi: r.walletName,
    doiTuong: r.customerName,
    danhMuc: r.categoryName,
    ghiChu: r.note,
    uniqueKey: r.uniqueKey,
    status: "OK",
  }));

  if (rows.length === 0) return NextResponse.json({ error: "Không có dòng đủ điều kiện để ghi" }, { status: 400 });

  const result = await importLogRows(rows, { sourceName: `csv_manual:${fileName}` });
  await logAudit({
    userId: admin.id,
    action: "import_csv_manual",
    entityType: "sync_run",
    entityId: String(result.syncRunId),
    details: { fileName, totalRows: preview.length, importedRows: rows.length, result },
    ipAddress: request.headers.get("x-forwarded-for") || undefined,
  });

  return NextResponse.json({ ...result, previewTotalRows: preview.length, importedRows: rows.length });
}
