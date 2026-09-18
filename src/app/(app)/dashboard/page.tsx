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
import ReportChart from "@/components/report-chart";
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  Users,
  FolderTree,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";

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
  icon: Icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon?: React.ComponentType<{ size: number; color?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div style={styles.metricCell}>
      <div style={styles.metricLabel}>
        {Icon && <Icon size={14} color={color || "var(--muted-foreground)"} />}
        <span>{label}</span>
      </div>
      <div style={{ ...styles.metricValue, color: color || "var(--foreground)" }}>
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
          <div style={styles.kpiTop}>
            <span style={styles.kpiLabel}>Giao dịch</span>
            <Receipt size={18} color="var(--primary)" />
          </div>
          <span style={styles.kpiValue}>{stats.transactions.toLocaleString("vi-VN")}</span>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <div style={styles.kpiTop}>
            <span style={styles.kpiLabel}>Đối tượng</span>
            <Users size={18} color="#0284c7" />
          </div>
          <span style={styles.kpiValue}>{stats.customers.toLocaleString("vi-VN")}</span>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <div style={styles.kpiTop}>
            <span style={styles.kpiLabel}>Ví / Danh mục</span>
            <FolderTree size={18} color="#8b5cf6" />
          </div>
          <span style={styles.kpiValue}>
            {stats.wallets} / {stats.categories}
          </span>
        </Link>
        <Link href="/import" style={styles.kpi}>
          <div style={styles.kpiTop}>
            <span style={styles.kpiLabel}>Nhập liệu</span>
            <UploadCloud size={18} color="#10b981" />
          </div>
          <span style={{ ...styles.kpiValue, fontSize: 16 }}>Dán dữ liệu</span>
        </Link>
      </div>

      <section style={styles.panel}>
        <div style={styles.panelHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileSpreadsheet size={20} color="var(--primary)" />
            <h2 style={styles.panelTitle}>Sổ thu chi</h2>
          </div>
          <p style={styles.panelMeta}>{syncNote}</p>
        </div>

        <div style={styles.todayBlock}>
          <div style={styles.todayLabel}>
            <span>Hôm nay</span>
            {report.today?.label ? (
              <span style={styles.todaySub}> · {report.today.label}</span>
            ) : null}
          </div>
          {report.today ? (
            <div style={styles.todayMetrics}>
              <MetricCell
                label="Thu"
                value={formatMoney(report.today.thu)}
                color="var(--success)"
                icon={ArrowDownLeft}
              />
              <MetricCell
                label="Chi"
                value={formatMoney(report.today.chi)}
                color="var(--danger)"
                icon={ArrowUpRight}
              />
              <MetricCell
                label="Ròng"
                value={formatRong(report.today.rong)}
                icon={TrendingUp}
              />
              {report.today.checkCount > 0 && (
                <div style={styles.warnChip}>
                  <AlertCircle size={14} />
                  <span>Cần kiểm tra: {report.today.checkCount}</span>
                </div>
              )}
            </div>
          ) : (
            <p style={styles.muted}>Chưa có dữ liệu đồng bộ.</p>
          )}
        </div>

        <div style={{ padding: "16px 20px" }}>
          <ReportChart rows={report.months} />
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
                  <tr key={`${m.label}-${i}`} style={styles.tr}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{m.label}</td>
                    <td
                      style={{
                        ...styles.td,
                        textAlign: "right",
                        color: "var(--success)",
                        fontWeight: 600,
                      }}
                    >
                      {formatMoney(m.thu)}
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        textAlign: "right",
                        color: "var(--danger)",
                        fontWeight: 600,
                      }}
                    >
                      {formatMoney(m.chi)}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>
                      {formatRong(m.rong)}
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {m.checkCount > 0 ? (
                        <span style={styles.warnText}>{m.checkCount}</span>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: "center", color: "var(--muted-foreground)", padding: 24 }}>
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
    maxWidth: 1200,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
  },
  kpi: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
    textDecoration: "none",
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  kpiTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiLabel: {
    fontSize: 13,
    color: "var(--muted-foreground)",
    fontWeight: 600,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--foreground)",
    lineHeight: 1.2,
  },
  panel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
  },
  panelTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "var(--foreground)",
  },
  panelMeta: {
    margin: 0,
    fontSize: 13,
    color: "var(--muted-foreground)",
  },
  todayBlock: {
    padding: "16px 20px",
    background: "var(--muted)",
    borderBottom: "1px solid var(--border)",
  },
  todayLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--foreground)",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  todaySub: {
    fontWeight: 400,
    color: "var(--muted-foreground)",
    fontSize: 13,
  },
  todayMetrics: {
    display: "flex",
    flexWrap: "wrap",
    gap: 32,
    alignItems: "flex-end",
  },
  metricCell: {
    minWidth: 120,
  },
  metricLabel: {
    fontSize: 12,
    color: "var(--muted-foreground)",
    marginBottom: 4,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
  },
  warnChip: {
    fontSize: 13,
    color: "#b45309",
    background: "#fef3c7",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 600,
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: "var(--muted-foreground)",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    padding: "12px 20px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    background: "var(--card)",
    borderBottom: "1px solid var(--border)",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "14px 20px",
    color: "var(--foreground)",
    whiteSpace: "nowrap",
  },
  warnText: {
    color: "#d97706",
    fontWeight: 700,
  },
};