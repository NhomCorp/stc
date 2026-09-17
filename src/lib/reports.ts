export type ReportRow = {
  label: string;
  thu: number;
  chi: number;
  rong: number;
  checkCount: number;
};

export type ReportSummary = {
  key: string;
  updatedAt: string | null;
  today: ReportRow | null;
  months: ReportRow[];
  syncedAt: string | null;
};

export function formatMoney(n: number): string {
  const abs = Math.abs(Math.round(n));
  const formatted = abs.toLocaleString("vi-VN");
  if (n < 0) return `-${formatted}`;
  return formatted;
}

export function formatRong(n: number): string {
  const base = formatMoney(Math.abs(n));
  if (n > 0) return `+${base}`;
  if (n < 0) return `-${base}`;
  return base;
}

export function normalizeReportRow(raw: unknown): ReportRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = String(r.label ?? "").trim();
  if (!label) return null;
  return {
    label,
    thu: Math.abs(Number(r.thu) || 0),
    chi: Math.abs(Number(r.chi) || 0),
    rong: Number(r.rong) || 0,
    checkCount: Number(r.checkCount) || 0,
  };
}

export function parseSyncPayload(body: unknown): ReportSummary {
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rowsRaw = Array.isArray(data.rows) ? data.rows : [];
  const rows = rowsRaw
    .map((row) => normalizeReportRow(row))
    .filter((row): row is ReportRow => !!row);

  const today = rows[0] ?? null;
  const months = rows.slice(1, 4);

  return {
    key: "bao_cao_v2",
    updatedAt: data.updatedAt ? String(data.updatedAt) : null,
    today,
    months,
    syncedAt: null,
  };
}
