import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  categoryGroups,
  customers,
  syncRuns,
  syncSources,
  transactions,
  wallets,
} from "@/db/schema";
import { buildChildToGroupMap } from "@/lib/category-tree";

/** Một dòng Log tháng (9 cột) — khớp MONTH_LOG_COL trong 0_Config.gs */
export type LogRowInput = {
  sourceSheet: string;
  sourceRowIndex?: number | null;
  ngay: string | Date | null;
  phanLoai: string | null;
  soTien: number | string | null;
  vi: string | null;
  doiTuong: string | null;
  danhMuc: string | null;
  ghiChu: string | null;
  uniqueKey: string | null;
  status: string | null;
};

export type ImportLogResult = {
  syncRunId: number;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  masters: {
    customersCreated: number;
    walletsCreated: number;
    categoriesCreated: number;
  };
  errors: Array<{ row: number; message: string }>;
};

const SPREADSHEET_ID = "1I6CzoQ5RTaWi_oBgLUH5eGUUOckCnHD-yWFTeEDHIg8";

function normalizeName(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function parseTxType(phanLoai: string | null): "thu" | "chi" | null {
  const v = normalizeName(phanLoai).toLowerCase();
  if (v === "thu") return "thu";
  if (v === "chi") return "chi";
  return null;
}

function parseAmount(raw: number | string | null, txType: "thu" | "chi"): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n);
}

function parseDate(raw: string | Date | null): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // ISO hoặc yyyy-mm-dd
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function mapStatus(raw: string | null): "valid" | "warning" | "error" {
  const v = normalizeName(raw).toUpperCase();
  if (v.includes("CHECK")) return "warning";
  if (v.includes("ERROR") || v.includes("LOI") || v.includes("LỖI")) return "error";
  return "valid";
}

function makeSourceKeyHash(uniqueKey: string, fallbackPayload: string): string {
  const key = uniqueKey.trim();
  if (key) {
    if (key.length <= 64) return key;
    return createHash("sha256").update(key).digest("hex").slice(0, 64);
  }
  return createHash("sha256").update(fallbackPayload).digest("hex").slice(0, 64);
}

async function ensureSyncSource() {
  const existing = await db.select().from(syncSources).limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(syncSources)
    .values({
      name: "Trhieu6179 - Sổ chi tiêu",
      type: "google_sheets",
      config: { spreadsheetId: SPREADSHEET_ID },
    })
    .returning();
  return created;
}

async function getOrCreateCustomer(
  name: string,
  cache: Map<string, number>
): Promise<{ id: number; created: boolean }> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { id: hit, created: false };

  const [found] = await db.select().from(customers).where(eq(customers.name, name)).limit(1);
  if (found) {
    cache.set(key, found.id);
    return { id: found.id, created: false };
  }

  const [created] = await db.insert(customers).values({ name }).returning();
  cache.set(key, created.id);
  return { id: created.id, created: true };
}

async function getOrCreateWallet(
  name: string,
  cache: Map<string, number>
): Promise<{ id: number; created: boolean }> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { id: hit, created: false };

  const [found] = await db.select().from(wallets).where(eq(wallets.name, name)).limit(1);
  if (found) {
    cache.set(key, found.id);
    return { id: found.id, created: false };
  }

  const [created] = await db.insert(wallets).values({ name }).returning();
  cache.set(key, created.id);
  return { id: created.id, created: true };
}

async function getOrCreateCategory(
  name: string,
  cache: Map<string, number>,
  groupCache: Map<string, number>
): Promise<{ id: number; created: boolean }> {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { id: hit, created: false };

  const [found] = await db.select().from(categories).where(eq(categories.name, name)).limit(1);
  if (found) {
    cache.set(key, found.id);
    return { id: found.id, created: false };
  }

  let groupId: number | null = null;
  const groupName = buildChildToGroupMap().get(key);
  if (groupName) {
    const gKey = groupName.toLowerCase();
    let gid = groupCache.get(gKey);
    if (!gid) {
      const [gFound] = await db
        .select()
        .from(categoryGroups)
        .where(eq(categoryGroups.name, groupName))
        .limit(1);
      if (gFound) {
        gid = gFound.id;
      } else {
        const [gCreated] = await db.insert(categoryGroups).values({ name: groupName }).returning();
        gid = gCreated.id;
      }
      groupCache.set(gKey, gid);
    }
    groupId = gid;
  }

  const [created] = await db.insert(categories).values({ name, groupId }).returning();
  cache.set(key, created.id);
  return { id: created.id, created: true };
}

/**
 * Parse text copy-paste từ Log (TSV/CSV).
 * Hỗ trợ: có header hoặc chỉ data; bỏ qua dòng trống.
 */
export function parseLogPaste(
  text: string,
  sourceSheet = "paste_manual"
): LogRowInput[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) =>
    delim === "\t"
      ? line.split("\t")
      : line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim());

  let start = 0;
  const first = split(lines[0]).map((c) => c.toLowerCase());
  if (
    first.some((c) => c.includes("ngày") || c.includes("ngay")) ||
    first.some((c) => c.includes("phân loại") || c.includes("phan loai"))
  ) {
    start = 1;
  }

  const rows: LogRowInput[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = split(lines[i]);
    if (cols.every((c) => !String(c).trim())) continue;
    rows.push({
      sourceSheet,
      sourceRowIndex: i + 1,
      ngay: cols[0] ?? null,
      phanLoai: cols[1] ?? null,
      soTien: cols[2] ?? null,
      vi: cols[3] ?? null,
      doiTuong: cols[4] ?? null,
      danhMuc: cols[5] ?? null,
      ghiChu: cols[6] ?? null,
      uniqueKey: cols[7] ?? null,
      status: cols[8] ?? null,
    });
  }
  return rows;
}

export async function importLogRows(
  rows: LogRowInput[],
  options?: { sourceName?: string }
): Promise<ImportLogResult> {
  const source = await ensureSyncSource();
  const sheetLabel = options?.sourceName || rows[0]?.sourceSheet || "import";

  const [run] = await db
    .insert(syncRuns)
    .values({
      sourceId: source.id,
      sheetName: sheetLabel,
      status: "running",
      totalRows: rows.length,
    })
    .returning();

  const customerCache = new Map<string, number>();
  const walletCache = new Map<string, number>();
  const categoryCache = new Map<string, number>();
  const groupCache = new Map<string, number>();

  // Prefill caches
  for (const c of await db.select().from(customers)) {
    customerCache.set(c.name.toLowerCase(), c.id);
  }
  for (const w of await db.select().from(wallets)) {
    walletCache.set(w.name.toLowerCase(), w.id);
  }
  for (const g of await db.select().from(categoryGroups)) {
    groupCache.set(g.name.toLowerCase(), g.id);
  }
  for (const c of await db.select().from(categories)) {
    categoryCache.set(c.name.toLowerCase(), c.id);
  }

  let validRows = 0;
  let duplicateRows = 0;
  let errorRows = 0;
  let customersCreated = 0;
  let walletsCreated = 0;
  let categoriesCreated = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = row.sourceRowIndex ?? i + 1;
    try {
      const txType = parseTxType(row.phanLoai);
      if (!txType) {
        errorRows++;
        errors.push({ row: rowNo, message: `Phân loại không hợp lệ: ${row.phanLoai}` });
        continue;
      }

      const txDate = parseDate(row.ngay);
      if (!txDate) {
        errorRows++;
        errors.push({ row: rowNo, message: `Ngày không hợp lệ: ${row.ngay}` });
        continue;
      }

      const amount = parseAmount(row.soTien, txType);
      if (amount === null) {
        errorRows++;
        errors.push({ row: rowNo, message: `Số tiền không hợp lệ: ${row.soTien}` });
        continue;
      }

      const uniqueKey = normalizeName(row.uniqueKey);
      const sourceKeyHash = makeSourceKeyHash(
        uniqueKey,
        `${row.sourceSheet}|${rowNo}|${txDate.toISOString()}|${txType}|${amount}`
      );

      const [existing] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            eq(transactions.sourceSheet, row.sourceSheet),
            eq(transactions.sourceKeyHash, sourceKeyHash)
          )
        )
        .limit(1);

      if (existing) {
        duplicateRows++;
        continue;
      }

      let customerId: number | null = null;
      let walletId: number | null = null;
      let categoryId: number | null = null;

      const doiTuong = normalizeName(row.doiTuong);
      if (doiTuong) {
        const r = await getOrCreateCustomer(doiTuong, customerCache);
        customerId = r.id;
        if (r.created) customersCreated++;
      }

      const vi = normalizeName(row.vi);
      if (vi) {
        const r = await getOrCreateWallet(vi, walletCache);
        walletId = r.id;
        if (r.created) walletsCreated++;
      }

      const danhMuc = normalizeName(row.danhMuc);
      if (danhMuc) {
        const r = await getOrCreateCategory(danhMuc, categoryCache, groupCache);
        categoryId = r.id;
        if (r.created) categoriesCreated++;
      }

      await db.insert(transactions).values({
        syncRunId: run.id,
        sourceFile: SPREADSHEET_ID,
        sourceSheet: row.sourceSheet,
        sourceRowIndex: row.sourceRowIndex ?? null,
        sourceKeyHash,
        txDate,
        txType,
        amount: amount.toFixed(2),
        customerId,
        walletId,
        categoryId,
        note: normalizeName(row.ghiChu) || null,
        rawData: row,
        status: mapStatus(row.status),
      });

      validRows++;
    } catch (err) {
      errorRows++;
      errors.push({
        row: rowNo,
        message: err instanceof Error ? err.message : "Lỗi không xác định",
      });
    }
  }

  const status =
    errorRows > 0 && validRows === 0
      ? "failed"
      : errorRows > 0 || duplicateRows > 0
        ? "warning"
        : "success";

  await db
    .update(syncRuns)
    .set({
      status,
      totalRows: rows.length,
      validRows,
      duplicateRows,
      errorRows,
      errorMessage: errors.length ? errors.slice(0, 20).map((e) => `dòng ${e.row}: ${e.message}`).join("; ") : null,
      completedAt: new Date(),
    })
    .where(eq(syncRuns.id, run.id));

  return {
    syncRunId: run.id,
    totalRows: rows.length,
    validRows,
    duplicateRows,
    errorRows,
    masters: { customersCreated, walletsCreated, categoriesCreated },
    errors: errors.slice(0, 50),
  };
}
