"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Download, BarChart3 } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { toast } from "sonner";

type CategoryStat = { categoryId: number | null; categoryName: string | null; amount: number; count: number };
type DailyFlow = { date: string; txType: "thu" | "chi"; amount: number };
type TopCustomer = { customerId: number | null; customerName: string | null; amount: number };
type WalletFlow = { walletId: number | null; walletName: string | null; txType: "thu" | "chi"; amount: number };

type ReportData = {
  categoryStats: CategoryStat[];
  dailyFlow: DailyFlow[];
  topCustomers: TopCustomer[];
  walletFlow: WalletFlow[];
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Date filters
  const [timeRange, setTimeRange] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const dateParams = useMemo(() => {
    const today = new Date();
    let from = new Date();
    let to = new Date();

    if (timeRange === "this_month") {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (timeRange === "last_month") {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (timeRange === "this_quarter") {
      const q = Math.floor(today.getMonth() / 3);
      from = new Date(today.getFullYear(), q * 3, 1);
      to = new Date(today.getFullYear(), q * 3 + 3, 0);
    } else if (timeRange === "this_year") {
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today.getFullYear(), 11, 31);
    } else if (timeRange === "custom") {
      return { from: customFrom, to: customTo };
    }

    // Adjust for local timezone
    from.setMinutes(from.getMinutes() - from.getTimezoneOffset());
    to.setMinutes(to.getMinutes() - to.getTimezoneOffset());
    
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }, [timeRange, customFrom, customTo]);

  useEffect(() => {
    if (timeRange === "custom" && (!dateParams.from || !dateParams.to)) return;
    
    const fetchReport = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateParams.from) params.set("from", dateParams.from);
        if (dateParams.to) params.set("to", dateParams.to);
        
        const res = await fetch(`/api/reports/detailed?${params}`);
        if (!res.ok) throw new Error("Không thể tải báo cáo");
        const json = await res.json();
        setData(json);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
        setLoading(false);
      }
    };
    
    fetchReport();
  }, [dateParams.from, dateParams.to]);

  const handleExport = () => {
    if (!data) return;
    
    let csv = "Loai,Ten,So_Tien,So_Giao_Dich\n";
    
    // Categories
    data.categoryStats.forEach(c => {
      csv += `Danh muc chi,${c.categoryName || "Khong ro"},${c.amount},${c.count}\n`;
    });
    
    // Top customers
    data.topCustomers.forEach(c => {
      csv += `Doi tuong chi,${c.customerName || "Khong ro"},${c.amount},\n`;
    });
    
    // Wallet flow
    data.walletFlow.forEach(w => {
      csv += `Vi ${w.txType === "thu" ? "Thu" : "Chi"},${w.walletName || "Khong ro"},${w.amount},\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bao_Cao_${dateParams.from}_${dateParams.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMoney = (val: number) => new Intl.NumberFormat("vi-VN").format(val) + " ₫";

  // Process data for charts
  const categoryOption = useMemo(() => {
    if (!data) return {};
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: any) => {
          const raw = data.categoryStats[params.dataIndex];
          return `<strong>${params.name}</strong><br/>Số tiền: ${formatMoney(raw.amount)}<br/>Số giao dịch: ${raw.count}<br/>Tỷ trọng: ${params.percent}%`;
        }
      },
      legend: { type: 'scroll', bottom: 0 },
      series: [
        {
          name: "Cơ cấu chi tiêu",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 5, borderColor: "#fff", borderWidth: 2 },
          label: { show: false },
          data: data.categoryStats.map(c => ({
            name: c.categoryName || "Chưa phân loại",
            value: c.amount,
          }))
        }
      ]
    };
  }, [data]);

  const flowOption = useMemo(() => {
    if (!data) return {};
    const datesMap = new Map<string, { thu: number; chi: number }>();
    
    // If range is large (like year), we might want to aggregate by month.
    // For now, let's keep it daily but let Echarts handle density.
    data.dailyFlow.forEach(d => {
      if (!datesMap.has(d.date)) datesMap.set(d.date, { thu: 0, chi: 0 });
      datesMap.get(d.date)![d.txType] = d.amount;
    });
    
    const sortedDates = Array.from(datesMap.keys()).sort();
    const thuData = sortedDates.map(d => datesMap.get(d)!.thu);
    const chiData = sortedDates.map(d => datesMap.get(d)!.chi);

    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { data: ["Thu", "Chi"], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: { type: "category", data: sortedDates },
      yAxis: { type: "value", axisLabel: { formatter: (value: number) => (value / 1000).toLocaleString("vi-VN") + "k" } },
      series: [
        {
          name: "Thu",
          type: "bar",
          data: thuData,
          itemStyle: { color: "#16a34a", borderRadius: [4, 4, 0, 0] }
        },
        {
          name: "Chi",
          type: "bar",
          data: chiData,
          itemStyle: { color: "#dc2626", borderRadius: [4, 4, 0, 0] }
        }
      ]
    };
  }, [data]);

  // Aggregate wallet flow
  const walletSummary = useMemo(() => {
    if (!data) return [];
    const map = new Map<number | null, { name: string; thu: number; chi: number }>();
    data.walletFlow.forEach(w => {
      if (!map.has(w.walletId)) map.set(w.walletId, { name: w.walletName || "Chưa phân loại", thu: 0, chi: 0 });
      map.get(w.walletId)![w.txType] += w.amount;
    });
    return Array.from(map.values()).sort((a, b) => (b.thu - b.chi) - (a.thu - a.chi));
  }, [data]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <BarChart3 color="var(--primary)" /> Báo cáo chuyên sâu
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted-foreground)", fontSize: 14 }}>
            Phân tích luồng tiền, cơ cấu chi tiêu và tổng hợp tài chính
          </p>
        </div>
        
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select 
            value={timeRange} 
            onChange={e => setTimeRange(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontWeight: 500 }}
          >
            <option value="this_month">Tháng này</option>
            <option value="last_month">Tháng trước</option>
            <option value="this_quarter">Quý này</option>
            <option value="this_year">Năm nay</option>
            <option value="custom">Tùy chỉnh...</option>
          </select>
          
          {timeRange === "custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: "7px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)" }} />
              <span>-</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: "7px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)" }} />
            </div>
          )}
          
          <button onClick={handleExport} disabled={loading || !data} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--primary)", color: "white", border: "none", fontWeight: 600, cursor: "pointer", opacity: (loading || !data) ? 0.6 : 1 }}>
            <Download size={16} /> Xuất CSV
          </button>
          <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--muted)", color: "var(--foreground)", border: "1px solid var(--border)", fontWeight: 600, cursor: "pointer" }}>
            In PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--muted-foreground)" }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          Đang tính toán dữ liệu...
        </div>
      ) : !data ? (
        <div style={{ padding: 60, textAlign: "center", color: "var(--danger)" }}>Lỗi tải báo cáo</div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          
          {/* Charts Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
            <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)", padding: 20, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Cơ cấu chi tiêu</h3>
              <ReactECharts option={categoryOption} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
            </div>
            
            <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)", padding: 20, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Xu hướng dòng tiền</h3>
              <ReactECharts option={flowOption} style={{ height: 320 }} notMerge={true} lazyUpdate={true} />
            </div>
          </div>

          {/* Tables Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
            
            {/* Top Customers */}
            <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)", padding: 20, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Top 5 Đối tượng chi tiêu nhiều nhất</h3>
              {data.topCustomers.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)" }}>Chưa có phát sinh chi.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.topCustomers.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--muted)", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: i === 0 ? "#fef08a" : i === 1 ? "#e2e8f0" : i === 2 ? "#fed7aa" : "var(--background)", color: "var(--foreground)", fontWeight: 700, fontSize: 14 }}>
                          {i + 1}
                        </span>
                        <span style={{ fontWeight: 600 }}>{c.customerName || "Chưa phân loại"}</span>
                      </div>
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{formatMoney(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Wallet Flow */}
            <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)", padding: 20, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700 }}>Dòng tiền theo Ví (Kỳ báo cáo)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px", borderBottom: "2px solid var(--border)", color: "var(--muted-foreground)" }}>Ví</th>
                      <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid var(--border)", color: "var(--muted-foreground)" }}>Tổng Thu</th>
                      <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid var(--border)", color: "var(--muted-foreground)" }}>Tổng Chi</th>
                      <th style={{ textAlign: "right", padding: "10px", borderBottom: "2px solid var(--border)", color: "var(--muted-foreground)" }}>Net Kỳ Này</th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletSummary.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: 20, color: "var(--muted-foreground)" }}>Chưa có giao dịch.</td></tr>
                    ) : (
                      walletSummary.map((w, i) => {
                        const net = w.thu - w.chi;
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "12px 10px", fontWeight: 600 }}>{w.name}</td>
                            <td style={{ padding: "12px 10px", textAlign: "right", color: "#16a34a", fontWeight: 500 }}>{w.thu > 0 ? "+" + formatMoney(w.thu) : "-"}</td>
                            <td style={{ padding: "12px 10px", textAlign: "right", color: "#dc2626", fontWeight: 500 }}>{w.chi > 0 ? "-" + formatMoney(w.chi) : "-"}</td>
                            <td style={{ padding: "12px 10px", textAlign: "right", fontWeight: 700, color: net > 0 ? "#16a34a" : net < 0 ? "#dc2626" : "var(--foreground)" }}>
                              {net > 0 ? "+" : ""}{formatMoney(net)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
