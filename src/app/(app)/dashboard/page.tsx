import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  reportSnapshots,
  transactions,
  customers,
  wallets,
  categories,
} from "@/db/schema";
import {
  formatMoney,
  formatRong,
  type ReportRow,
  type ReportSummary,
} from "@/lib/reports";

async function loadReportSummary(): Promise<ReportSummary> {
  try {
    const [row] = await db
      .select()
      .from(reportSnapshots)
      .where(eq(reportSnapshots.key, "bao_cao_v2"))
      .limit(1);

    if (!row) {
      return {
        key: "bao_cao_v2",
        updatedAt: null,
        today: null,
        months: [],
        syncedAt: null,
      };
    }

    const payload = row.payload as {
      updatedAt?: string | null;
      today?: ReportRow | null;
      months?: ReportRow[];
    };

    return {
      key: "bao_cao_v2",
      updatedAt: payload.updatedAt ?? null,
      today: payload.today ?? null,
      months: Array.isArray(payload.months) ? payload.months : [],
      syncedAt: row.syncedAt?.toISOString() ?? null,
    };
  } catch {
    return {
      key: "bao_cao_v2",
      updatedAt: null,
      today: null,
      months: [],
      syncedAt: null,
    };
  }
}

async function loadDbStats() {
  try {
    const [tx, cus, wal, cat] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(transactions),
      db.select({ count: sql<number>`count(*)::int` }).from(customers),
      db.select({ count: sql<number>`count(*)::int` }).from(wallets),
      db.select({ count: sql<number>`count(*)::int` }).from(categories),
    ]);
    return {
      transactions: tx[0]?.count ?? 0,
      customers: cus[0]?.count ?? 0,
      wallets: wal[0]?.count ?? 0,
      categories: cat[0]?.count ?? 0,
    };
  } catch {
    return { transactions: 0, customers: 0, wallets: 0, categories: 0 };
  }
}

function MetricCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={styles.metricCell}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, color: color || "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const [report, stats] = await Promise.all([
    loadReportSummary(),
    loadDbStats(),
  ]);

  const syncNote = [
    report.updatedAt || null,
    report.syncedAt
      ? `Sync web: ${new Date(report.syncedAt).toLocaleString("vi-VN")}`
      : "Chưa sync — cấu hình báo cáo từ Apps Script.",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={styles.page}>
      <div style={styles.kpiRow}>
        <Link href="/transactions" style={styles.kpi}>
          <span style={styles.kpiLabel}>Giao dịch</span>
          <span style={styles.kpiValue}>{stats.transactions}</span>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <span style={styles.kpiLabel}>Đối tượng</span>
          <span style={styles.kpiValue}>{stats.customers}</span>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <span style={styles.kpiLabel}>Ví / Danh mục</span>
          <span style={styles.kpiValue}>
            {stats.wallets} / {stats.categories}
          </span>
        </Link>
        <Link href="/import" style={styles.kpi}>
          <span style={styles.kpiLabel}>Import Log</span>
          <span style={{ ...styles.kpiValue, fontSize: 15 }}>Paste / CLI</span>
        </Link>
      </div>

      <section style={styles.panel}>
        <div style={styles.panelHead}>
          <h2 style={styles.panelTitle}>Báo cáo Sheet</h2>
          <p style={styles.panelMeta}>{syncNote}</p>
        </div>

        <div style={styles.todayBlock}>
          <div style={styles.todayLabel}>
            Hôm nay
            {report.today?.label ? (
              <span style={styles.todaySub}> · {report.today.label}</span>
            ) : null}
          </div>
          {report.today ? (
            <div style={styles.todayMetrics}>
              <MetricCell
                label="Thu"
                value={formatMoney(report.today.thu)}
                color="#15803d"
              />
              <MetricCell
                label="Chi"
                value={formatMoney(report.today.chi)}
                color="#b91c1c"
              />
              <MetricCell
                label="Ròng"
                value={formatRong(report.today.rong)}
              />
              {report.today.checkCount > 0 && (
                <div style={styles.warnChip}>
                  Cần kiểm tra: {report.today.checkCount}
                </div>
              )}
            </div>
          ) : (
            <p style={styles.muted}>Chưa có dữ liệu đồng bộ.</p>
          )}
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Tháng</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Thu</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Chi</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Ròng</th>
                <th style={{ ...styles.th, textAlign: "right" }}>Cần KT</th>
              </tr>
            </thead>
            <tbody>
              {report.months.length > 0 ? (
                report.months.map((m, i) => (
                  <tr key={`${m.label}-${i}`}>
                    <td style={styles.td}>{m.label}</td>
                    <td
                      style={{
                        ...styles.td,
                        textAlign: "right",
                        color: "#15803d",
                      }}
                    >
                      {formatMoney(m.thu)}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        textAlign: "right",
                        color: "#b91c1c",
                      }}
                    >
                      {formatMoney(m.chi)}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 600 }}>
                      {formatRong(m.rong)}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {m.checkCount > 0 ? (
                        <span style={styles.warnText}>{m.checkCount}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, color: "#94a3b8" }}>
                    Chưa có số liệu tháng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
  },
  kpi: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "12px 14px",
    textDecoration: "none",
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
  },
  kpiLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: 500,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.2,
  },
  panel: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 16px",
    borderBottom: "1px solid #f1f5f9",
  },
  panelTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  panelMeta: {
    margin: 0,
    fontSize: 12,
    color: "#64748b",
  },
  todayBlock: {
    padding: "14px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #f1f5f9",
    boxShadow: "inset 0 -1px 0 rgba(255, 255, 255, 0.1)",
  },
  todayLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#334155",
    marginBottom: 10,
  },
  todaySub: {
    fontWeight: 400,
    color: "#64748b",
  },
  todayMetrics: {
    display: "flex",
    flexWrap: "wrap",
    gap: 24,
    alignItems: "flex-end",
  },
  metricCell: {
    minWidth: 100,
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 700,
  },
  warnChip: {
    fontSize: 12,
    color: "#b45309",
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 6,
    padding: "4px 8px",
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: "#94a3b8",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    padding: "10px 16px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.1)",
  },
  td: {
    padding: "10px 16px",
    borderBottom: "1px solid #f1f5f9",
    color: "#0f172a",
    whiteSpace: "nowrap",
  },
  warnText: {
    color: "#b45309",
    fontWeight: 600,
  }
};