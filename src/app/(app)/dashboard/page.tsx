import { redirect } from "next/navigation";
import Link from "next/link";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { transactions, customers, wallets, categories } from "@/db/schema";
import { formatMoney, formatRong } from "@/lib/reports";
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
  TrendingDown,
  UploadCloud,
  Users,
  WalletCards,
  CreditCard,
  Banknote,
  Smartphone
} from "lucide-react";

async function loadDashboardData() {
  const today = new Date();
  
  // This month
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  
  // Last month
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
  
  // Last 7 days
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [
    allWallets,
    walletFlow,
    thisMonthStats,
    lastMonthStats,
    recentTxs,
    sevenDaysFlow
  ] = await Promise.all([
    db.select({ id: wallets.id, name: wallets.name }).from(wallets).where(eq(wallets.isActive, true)),
    db.select({
      walletId: transactions.walletId,
      txType: transactions.txType,
      amount: sql<number>`sum(${transactions.amount})::numeric`
    }).from(transactions).groupBy(transactions.walletId, transactions.txType),
    
    db.select({
      txType: transactions.txType,
      amount: sql<number>`sum(${transactions.amount})::numeric`
    }).from(transactions).where(and(gte(transactions.txDate, thisMonthStart), lte(transactions.txDate, thisMonthEnd))).groupBy(transactions.txType),
    
    db.select({
      txType: transactions.txType,
      amount: sql<number>`sum(${transactions.amount})::numeric`
    }).from(transactions).where(and(gte(transactions.txDate, lastMonthStart), lte(transactions.txDate, lastMonthEnd))).groupBy(transactions.txType),
    
    db.select({
      id: transactions.id,
      txDate: transactions.txDate,
      txType: transactions.txType,
      amount: transactions.amount,
      note: transactions.note,
      walletName: wallets.name,
      categoryName: categories.name,
      customerName: customers.name
    })
    .from(transactions)
    .leftJoin(wallets, eq(transactions.walletId, wallets.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(customers, eq(transactions.customerId, customers.id))
    .orderBy(desc(transactions.txDate), desc(transactions.id))
    .limit(7),

    db.select({
      date: sql<string>`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      txType: transactions.txType,
      amount: sql<number>`sum(${transactions.amount})::numeric`
    })
    .from(transactions)
    .where(gte(transactions.txDate, sevenDaysAgo))
    .groupBy(sql`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, transactions.txType)
    .orderBy(sql`to_char(${transactions.txDate} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
  ]);

  // Process wallet balances
  const balances = allWallets.map(w => {
    const wFlow = walletFlow.filter(f => f.walletId === w.id);
    const thu = wFlow.find(f => f.txType === "thu")?.amount || 0;
    const chi = wFlow.find(f => f.txType === "chi")?.amount || 0;
    return { ...w, balance: Number(thu) - Number(chi) };
  }).sort((a, b) => b.balance - a.balance);

  const totalAssets = balances.reduce((sum, w) => sum + w.balance, 0);

  // Month stats
  const tmThu = Number(thisMonthStats.find(s => s.txType === "thu")?.amount || 0);
  const tmChi = Number(thisMonthStats.find(s => s.txType === "chi")?.amount || 0);
  const lmThu = Number(lastMonthStats.find(s => s.txType === "thu")?.amount || 0);
  const lmChi = Number(lastMonthStats.find(s => s.txType === "chi")?.amount || 0);

  const tmNet = tmThu - tmChi;

  return { balances, totalAssets, tmThu, tmChi, lmThu, lmChi, tmNet, recentTxs, sevenDaysFlow };
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

function getWalletIcon(walletName: string) {
  const name = walletName.toLowerCase();
  if (name.includes("momo") || name.includes("zalopay") || name.includes("vi")) return <Smartphone size={16} />;
  if (name.includes("tiền mặt") || name.includes("cash")) return <Banknote size={16} />;
  return <CreditCard size={16} />;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const data = await loadDashboardData();

  const getPercent = (current: number, last: number) => {
    if (last === 0) return null;
    const p = ((current - last) / last) * 100;
    return { val: Math.abs(p).toFixed(1), up: p >= 0 };
  };

  const thuP = getPercent(data.tmThu, data.lmThu);
  const chiP = getPercent(data.tmChi, data.lmChi);

  return (
    <div style={styles.page}>
      
      {/* Tầng 1: 4 thẻ kpi */}
      <section style={styles.kpiRow}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiTitle}>Tài sản khả dụng</span>
            <div style={{...styles.kpiIconBox, background: 'rgba(37, 99, 235, 0.15)', color: '#2563eb'}}>
              <WalletCards size={20} />
            </div>
          </div>
          <div style={{...styles.kpiValue, color: "var(--foreground)"}}>{formatMoney(data.totalAssets)} ₫</div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiTitle}>Tổng thu tháng này</span>
            <div style={{...styles.kpiIconBox, background: 'rgba(22, 163, 74, 0.15)', color: '#16a34a'}}>
              <ArrowDownLeft size={20} />
            </div>
          </div>
          <div style={{...styles.kpiValue, color: "#16a34a"}}>+{formatMoney(data.tmThu)} ₫</div>
          <div style={styles.kpiMeta}>
            {thuP ? (
              <span style={{ color: thuP.up ? "#16a34a" : "#dc2626", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                {thuP.up ? <TrendingUp size={14}/> : <TrendingDown size={14}/>} {thuP.val}% so với tháng trước
              </span>
            ) : (
              <span style={{ color: "var(--muted-foreground)" }}>Chưa có cơ sở so sánh</span>
            )}
          </div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiTitle}>Tổng chi tháng này</span>
            <div style={{...styles.kpiIconBox, background: 'rgba(220, 38, 38, 0.15)', color: '#dc2626'}}>
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div style={{...styles.kpiValue, color: "#dc2626"}}>-{formatMoney(data.tmChi)} ₫</div>
          <div style={styles.kpiMeta}>
            {chiP ? (
              <span style={{ color: chiP.up ? "#dc2626" : "#16a34a", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                {chiP.up ? <TrendingUp size={14}/> : <TrendingDown size={14}/>} {chiP.val}% so với tháng trước
              </span>
            ) : (
              <span style={{ color: "var(--muted-foreground)" }}>Chưa có cơ sở so sánh</span>
            )}
          </div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiTitle}>Dòng tiền ròng (Net)</span>
            <div style={{...styles.kpiIconBox, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6'}}>
              <BarChart3 size={20} />
            </div>
          </div>
          <div style={{...styles.kpiValue, color: data.tmNet > 0 ? "#16a34a" : data.tmNet < 0 ? "#dc2626" : "var(--foreground)"}}>
            {data.tmNet > 0 ? "+" : ""}{formatMoney(data.tmNet)} ₫
          </div>
        </div>
      </section>

      {/* Tầng 2: Biểu đồ & Tiện ích Ví (60/40) */}
      <section style={styles.splitSection}>
        <div style={styles.chartPanel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Thu / Chi 7 ngày qua</h2>
            <Link href="/reports" style={styles.linkBtn}>Xem báo cáo <ArrowRight size={14}/></Link>
          </div>
          <div style={styles.chartWrap}>
            {/* Very simple visual bars representing sevenDaysFlow. We don't want to bring Echarts here if we can avoid it to keep it extremely fast, or we could just render basic HTML bars. */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 200, padding: '20px 0 0', gap: 8 }}>
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                const dateStr = d.toISOString().slice(0, 10);
                const dayFlow = data.sevenDaysFlow.filter(f => f.date === dateStr);
                const thu = Number(dayFlow.find(f => f.txType === "thu")?.amount || 0);
                const chi = Number(dayFlow.find(f => f.txType === "chi")?.amount || 0);
                
                // calculate max to scale
                const maxVal = Math.max(...data.sevenDaysFlow.map(f => Number(f.amount)), 1);
                
                const thuH = (thu / maxVal) * 100;
                const chiH = (chi / maxVal) * 100;
                
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 8 }}>
                    <div style={{ display: 'flex', gap: 4, height: 140, alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                      <div title={`Thu: ${formatMoney(thu)}`} style={{ width: '40%', height: `${Math.max(thuH, 2)}%`, background: '#16a34a', borderRadius: '4px 4px 0 0' }} />
                      <div title={`Chi: ${formatMoney(chi)}`} style={{ width: '40%', height: `${Math.max(chiH, 2)}%`, background: '#dc2626', borderRadius: '4px 4px 0 0' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 600 }}>{d.getDate()}/{d.getMonth()+1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={styles.walletPanel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Số dư các ví</h2>
            <Link href="/master?tab=wallets" style={styles.linkBtn}>Quản lý <ArrowRight size={14}/></Link>
          </div>
          <div style={styles.walletList}>
            {data.balances.map(w => (
              <div key={w.id} style={styles.walletItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={styles.walletIconBox}>
                    {getWalletIcon(w.name)}
                  </div>
                  <span style={styles.walletName}>{w.name}</span>
                </div>
                <strong style={styles.walletBalance}>{formatMoney(w.balance)} ₫</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tầng 3: Giao dịch gần đây */}
      <section style={styles.recentPanel}>
        <div style={styles.panelHead}>
          <h2 style={styles.panelTitle}>Giao dịch gần đây</h2>
          <Link href="/transactions" style={styles.primaryBtn}>
            Xem toàn bộ <ArrowRight size={16}/>
          </Link>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ngày</th>
                <th style={styles.th}>Loại</th>
                <th style={{...styles.th, textAlign: 'right'}}>Số tiền</th>
                <th style={styles.th}>Đối tượng</th>
                <th style={styles.th}>Ví</th>
                <th style={styles.th}>Danh mục</th>
                <th style={styles.th}>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTxs.map(t => (
                <tr key={t.id} style={styles.tr}>
                  <td style={styles.td}>
                    {new Date(t.txDate).toLocaleDateString("vi-VN")}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: t.txType === "thu" ? '#dcfce7' : '#fee2e2',
                        color: t.txType === "thu" ? '#16a34a' : '#dc2626',
                    }}>
                      {t.txType === 'thu' ? 'Thu' : 'Chi'}
                    </span>
                  </td>
                  <td style={{...styles.td, textAlign: 'right', fontWeight: 700, color: t.txType === 'thu' ? '#16a34a' : '#dc2626'}}>
                    {t.txType === 'thu' ? '+' : '-'}{formatMoney(Number(t.amount))} ₫
                  </td>
                  <td style={styles.td}>{t.customerName || "—"}</td>
                  <td style={styles.td}>
                    {t.walletName ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, background: 'var(--muted)', padding: '4px 8px', borderRadius: 6, fontWeight: 600 }}>
                        {getWalletIcon(t.walletName)} {t.walletName}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={styles.td}>{t.categoryName || "—"}</td>
                  <td style={{...styles.td, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                    {t.note || "—"}
                  </td>
                </tr>
              ))}
              {data.recentTxs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Chưa có giao dịch nào</td></tr>
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
    maxWidth: 1240,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  },
  kpiCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
  },
  kpiHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiTitle: {
    fontSize: 14,
    color: "var(--muted-foreground)",
    fontWeight: 700,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  kpiMeta: {
    fontSize: 13,
  },
  splitSection: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
  },
  chartPanel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    flex: "3 1 500px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
  },
  walletPanel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    flex: "2 1 300px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  panelTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 800,
    color: "var(--foreground)",
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--primary)",
    textDecoration: "none",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--primary-foreground)",
    background: "var(--primary)",
    padding: "8px 16px",
    borderRadius: 8,
    textDecoration: "none",
  },
  chartWrap: {
    width: "100%",
  },
  walletList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  walletItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px",
    background: "var(--muted)",
    borderRadius: 12,
  },
  walletIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "var(--card)",
    border: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--foreground)",
  },
  walletName: {
    fontWeight: 600,
    fontSize: 15,
  },
  walletBalance: {
    fontWeight: 800,
    fontSize: 15,
  },
  recentPanel: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    color: "var(--muted-foreground)",
    fontWeight: 700,
    borderBottom: "2px solid var(--border)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },
  tr: {},
};
