import { redirect } from "next/navigation";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { transactions, customers, wallets, categories } from "@/db/schema";
import { formatMoney, formatRong, type ReportSummary } from "@/lib/reports";
import { aggregateTransactionReport } from "@/lib/report-aggregation";
import ReportChart from "@/components/report-chart";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Clock3,
  FolderTree,
  PlusCircle,
  Receipt,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
  WalletCards,
} from "lucide-react";

async function loadReportSummary(): Promise<ReportSummary> {
  try {
    return await aggregateTransactionReport();
  } catch (error) {
    console.error("Dashboard report aggregation failed:", error);
    return {
      key: "postgres_transactions",
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
        {Icon && <Icon size={15} color={color || "var(--muted-foreground)"} />}
        <span>{label}</span>
      </div>
      <div style={{ ...styles.metricValue, color: color || "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size: number; color?: string }>;
}) {
  return (
    <Link href={href} style={styles.quickAction}>
      <span style={styles.quickIcon}><Icon size={18} color="var(--primary)" /></span>
      <span style={styles.quickText}>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight size={16} color="var(--muted-foreground)" />
    </Link>
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

  const todayRong = report.today?.rong ?? 0;
  const latestMonth = report.months[report.months.length - 1] ?? null;
  const totalCheck = report.months.reduce((sum, month) => sum + month.checkCount, 0);
  const syncNote = report.updatedAt
    ? new Date(report.updatedAt).toLocaleString("vi-VN")
    : "Chưa có số liệu";

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={styles.heroContent}>
          <div style={styles.eyebrow}>
            <Sparkles size={15} />
            <span>Tổng quan tài chính</span>
          </div>
          <h1 style={styles.title}>Dashboard Sổ Thu Chi</h1>
          <p style={styles.subtitle}>
            Theo dõi thu, chi, dòng tiền ròng và dữ liệu cần kiểm tra trong một màn hình.
          </p>
          <div style={styles.heroActions}>
            <Link href="/transactions" style={styles.primaryButton}>
              <PlusCircle size={18} />
              Thêm giao dịch
            </Link>
            <Link href="/import" style={styles.secondaryButton}>
              <UploadCloud size={18} />
              Nhập dữ liệu
            </Link>
          </div>
        </div>

        <div style={styles.heroCard}>
          <div style={styles.heroCardTop}>
            <span style={styles.heroCardLabel}>Ròng hôm nay</span>
            <TrendingUp size={18} color="var(--primary)" />
          </div>
          <strong style={{ ...styles.heroAmount, color: todayRong >= 0 ? "var(--success)" : "var(--danger)" }}>
            {formatRong(todayRong)}
          </strong>
          <span style={styles.heroCardMeta}>
            <Clock3 size={14} /> Cập nhật: {syncNote}
          </span>
        </div>
      </section>

      <section style={styles.kpiRow}>
        <Link href="/transactions" style={styles.kpi}>
          <span style={{ ...styles.kpiIcon, background: "rgba(37, 99, 235, 0.12)" }}>
            <Receipt size={20} color="var(--primary)" />
          </span>
          <span style={styles.kpiLabel}>Giao dịch</span>
          <strong style={styles.kpiValue}>{stats.transactions.toLocaleString("vi-VN")}</strong>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <span style={{ ...styles.kpiIcon, background: "rgba(2, 132, 199, 0.12)" }}>
            <Users size={20} color="#0284c7" />
          </span>
          <span style={styles.kpiLabel}>Đối tượng</span>
          <strong style={styles.kpiValue}>{stats.customers.toLocaleString("vi-VN")}</strong>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <span style={{ ...styles.kpiIcon, background: "rgba(139, 92, 246, 0.12)" }}>
            <WalletCards size={20} color="#8b5cf6" />
          </span>
          <span style={styles.kpiLabel}>Ví tiền</span>
          <strong style={styles.kpiValue}>{stats.wallets.toLocaleString("vi-VN")}</strong>
        </Link>
        <Link href="/master" style={styles.kpi}>
          <span style={{ ...styles.kpiIcon, background: "rgba(16, 185, 129, 0.12)" }}>
            <FolderTree size={20} color="#10b981" />
          </span>
          <span style={styles.kpiLabel}>Danh mục</span>
          <strong style={styles.kpiValue}>{stats.categories.toLocaleString("vi-VN")}</strong>
        </Link>
      </section>

      <section style={styles.contentGrid}>
        <div style={styles.mainPanel}>
          <div style={styles.panelHead}>
            <div>
              <span style={styles.sectionLabel}>Báo cáo</span>
              <h2 style={styles.panelTitle}>Dòng tiền theo tháng</h2>
            </div>
            <span style={styles.statusPill}>
              <BarChart3 size={15} /> {report.months.length} tháng
            </span>
          </div>

          <div style={styles.todayBlock}>
            <div style={styles.todayIntro}>
              <span style={styles.sectionLabel}>Hôm nay</span>
              <strong>{report.today?.label || "Chưa có dữ liệu"}</strong>
            </div>
            {report.today ? (
              <div style={styles.todayMetrics}>
                <MetricCell label="Thu" value={formatMoney(report.today.thu)} color="var(--success)" icon={ArrowDownLeft} />
                <MetricCell label="Chi" value={formatMoney(report.today.chi)} color="var(--danger)" icon={ArrowUpRight} />
                <MetricCell label="Ròng" value={formatRong(report.today.rong)} icon={TrendingUp} />
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

          <div style={styles.chartBox}>
            <ReportChart rows={report.months} />
          </div>
        </div>

        <aside style={styles.sidePanel}>
          <div style={styles.panelHeadCompact}>
            <span style={styles.sectionLabel}>Thao tác nhanh</span>
            <h2 style={styles.panelTitle}>Điều hướng</h2>
          </div>
          <div style={styles.quickList}>
            <QuickAction href="/transactions" label="Xem giao dịch" description="Tra cứu, lọc và kiểm tra" icon={Receipt} />
            <QuickAction href="/import" label="Dán dữ liệu" description="Nhập nhanh từ sao kê" icon={UploadCloud} />
            <QuickAction href="/master" label="Master data" description="Ví, danh mục, đối tượng" icon={FolderTree} />
          </div>

          <div style={styles.insightCard}>
            <span style={styles.sectionLabel}>Tình trạng</span>
            <strong style={styles.insightNumber}>{totalCheck}</strong>
            <span style={styles.insightText}>giao dịch cần kiểm tra trong các tháng đang hiển thị</span>
          </div>
        </aside>
      </section>

      <section style={styles.tablePanel}>
        <div style={styles.panelHead}>
          <div>
            <span style={styles.sectionLabel}>Chi tiết</span>
            <h2 style={styles.panelTitle}>Bảng tổng hợp tháng</h2>
          </div>
          {latestMonth ? <span style={styles.statusPill}>Mới nhất: {latestMonth.label}</span> : null}
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
                    <td style={{ ...styles.td, fontWeight: 700 }}>{m.label}</td>
                    <td style={{ ...styles.td, textAlign: "right", color: "var(--success)", fontWeight: 700 }}>{formatMoney(m.thu)}</td>
                    <td style={{ ...styles.td, textAlign: "right", color: "var(--danger)", fontWeight: 700 }}>{formatMoney(m.chi)}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 800 }}>{formatRong(m.rong)}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>
                      {m.checkCount > 0 ? <span style={styles.warnText}>{m.checkCount}</span> : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...styles.td, textAlign: "center", color: "var(--muted-foreground)", padding: 28 }}>
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

const cardShadow = "0 18px 45px rgba(15, 23, 42, 0.08)";

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1240,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    width: "100%",
  },
  hero: {
    position: "relative",
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 18,
    alignItems: "stretch",
    padding: 24,
    borderRadius: 24,
    border: "1px solid rgba(37, 99, 235, 0.16)",
    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(16, 185, 129, 0.08) 48%, var(--card))",
    boxShadow: cardShadow,
  },
  heroGlow: {
    position: "absolute",
    inset: "auto -90px -120px auto",
    width: 260,
    height: 260,
    borderRadius: "50%",
    background: "rgba(37, 99, 235, 0.18)",
    filter: "blur(18px)",
  },
  heroContent: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  eyebrow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(255, 255, 255, 0.72)",
    color: "var(--primary)",
    fontSize: 13,
    fontWeight: 800,
  },
  title: {
    margin: 0,
    fontSize: 34,
    lineHeight: 1.08,
    letterSpacing: "-0.04em",
    color: "var(--foreground)",
  },
  subtitle: {
    maxWidth: 620,
    margin: 0,
    fontSize: 15,
    lineHeight: 1.6,
    color: "var(--muted-foreground)",
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    textDecoration: "none",
    fontWeight: 800,
    boxShadow: "0 12px 24px rgba(37, 99, 235, 0.25)",
  },
  secondaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(255, 255, 255, 0.72)",
    border: "1px solid rgba(37, 99, 235, 0.18)",
    color: "var(--foreground)",
    textDecoration: "none",
    fontWeight: 800,
  },
  heroCard: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 16,
    padding: 18,
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.78)",
    border: "1px solid rgba(255, 255, 255, 0.8)",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.08)",
  },
  heroCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroCardLabel: {
    color: "var(--muted-foreground)",
    fontSize: 13,
    fontWeight: 800,
  },
  heroAmount: {
    fontSize: 34,
    letterSpacing: "-0.04em",
  },
  heroCardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "var(--muted-foreground)",
    fontSize: 12,
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  kpi: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
    textDecoration: "none",
    color: "inherit",
    display: "grid",
    gridTemplateColumns: "44px 1fr",
    gap: "6px 12px",
    alignItems: "center",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
  },
  kpiIcon: {
    gridRow: "span 2",
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiLabel: {
    fontSize: 13,
    color: "var(--muted-foreground)",
    fontWeight: 700,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 900,
    color: "var(--foreground)",
    lineHeight: 1.1,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 320px",
    gap: 18,
    alignItems: "start",
  },
  mainPanel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: cardShadow,
  },
  sidePanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    padding: 16,
    boxShadow: cardShadow,
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "18px 20px",
    borderBottom: "1px solid var(--border)",
  },
  panelHeadCompact: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  sectionLabel: {
    display: "block",
    color: "var(--primary)",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  panelTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
    color: "var(--foreground)",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 10px",
    borderRadius: 999,
    background: "var(--muted)",
    color: "var(--muted-foreground)",
    fontSize: 12,
    fontWeight: 800,
  },
  todayBlock: {
    margin: "16px 20px 0",
    padding: 16,
    borderRadius: 18,
    background: "linear-gradient(135deg, var(--muted), rgba(37, 99, 235, 0.06))",
    border: "1px solid var(--border)",
  },
  todayIntro: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    marginBottom: 14,
  },
  todayMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
    gap: 14,
    alignItems: "stretch",
  },
  metricCell: {
    padding: 12,
    borderRadius: 14,
    background: "var(--card)",
    border: "1px solid rgba(148, 163, 184, 0.22)",
  },
  metricLabel: {
    fontSize: 12,
    color: "var(--muted-foreground)",
    marginBottom: 6,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  metricValue: {
    fontSize: 21,
    fontWeight: 900,
  },
  warnChip: {
    fontSize: 13,
    color: "#b45309",
    background: "#fef3c7",
    border: "1px solid #fde68a",
    borderRadius: 14,
    padding: "12px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 800,
  },
  muted: {
    margin: 0,
    fontSize: 13,
    color: "var(--muted-foreground)",
  },
  chartBox: {
    padding: "6px 4px 0",
  },
  quickList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  quickAction: {
    display: "grid",
    gridTemplateColumns: "42px 1fr 16px",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    background: "var(--muted)",
    color: "inherit",
    textDecoration: "none",
    border: "1px solid transparent",
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--card)",
  },
  quickText: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  },
  insightCard: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
    borderRadius: 18,
    background: "linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(37, 99, 235, 0.08))",
    border: "1px solid rgba(245, 158, 11, 0.22)",
  },
  insightNumber: {
    fontSize: 34,
    lineHeight: 1,
    color: "#d97706",
  },
  insightText: {
    color: "var(--muted-foreground)",
    fontSize: 13,
    lineHeight: 1.45,
  },
  tablePanel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: cardShadow,
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
    padding: "13px 20px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 900,
    color: "var(--muted-foreground)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "var(--muted)",
    borderBottom: "1px solid var(--border)",
  },
  tr: {
    borderBottom: "1px solid var(--border)",
  },
  td: {
    padding: "15px 20px",
    color: "var(--foreground)",
    whiteSpace: "nowrap",
  },
  warnText: {
    display: "inline-flex",
    minWidth: 28,
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    color: "#b45309",
    background: "#fef3c7",
    fontWeight: 900,
  },
};
