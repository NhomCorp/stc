"use client";

import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { ReportRow } from "@/lib/reports";

type ChartType = "bar" | "stack" | "line" | "pie";
type TimeRange = "all" | "3" | "6" | "12";

export default function ReportChart({ rows }: { rows: ReportRow[] }) {
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [showThu, setShowThu] = useState(true);
  const [showChi, setShowChi] = useState(true);
  const [showRong, setShowRong] = useState(true);
  const [showCheck, setShowCheck] = useState(false);
  const [smoothLine, setSmoothLine] = useState(true);
  const [fillArea, setFillArea] = useState(true);

  // Lọc dữ liệu theo thời gian
  const filteredRows = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    if (timeRange === "all") return rows;
    const count = parseInt(timeRange, 10);
    return rows.slice(-count);
  }, [rows, timeRange]);

  // Cấu hình ECharts Option
  const option = useMemo(() => {
    if (!filteredRows.length) return {};

    const formatMoneyVND = (val: number) =>
      `${new Intl.NumberFormat("vi-VN").format(Math.round(val))} đ`;

    const formatCompact = (val: number) => {
      const abs = Math.abs(val);
      if (abs >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)} tỷ`;
      if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(0)} tr`;
      if (abs >= 1_000) return `${(val / 1_000).toFixed(0)} k`;
      return `${val}`;
    };

    // 1. Biểu đồ tròn (Donut / Pie)
    if (chartType === "pie") {
      const totalThu = filteredRows.reduce((sum, r) => sum + (r.thu || 0), 0);
      const totalChi = filteredRows.reduce((sum, r) => sum + (r.chi || 0), 0);

      return {
        title: {
          text: "Tỷ trọng Thu / Chi",
          subtext: `Khoảng: ${filteredRows[0]?.label || ""} - ${
            filteredRows[filteredRows.length - 1]?.label || ""
          }`,
          left: "center",
          textStyle: { fontSize: 14, fontWeight: "bold", color: "#1e293b" },
        },
        tooltip: {
          trigger: "item",
          formatter: (params: { name: string; value: number; percent: number }) =>
            `<strong>${params.name}</strong><br/>${formatMoneyVND(
              params.value
            )} (${params.percent}%)`,
        },
        legend: { bottom: 10, left: "center" },
        toolbox: {
          feature: {
            saveAsImage: { title: "Lưu ảnh" },
          },
        },
        series: [
          {
            name: "Cơ cấu",
            type: "pie",
            radius: ["40%", "70%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: "{b}: {d}%",
            },
            data: [
              {
                value: totalThu,
                name: "Tổng Thu",
                itemStyle: { color: "#16a34a" },
              },
              {
                value: totalChi,
                name: "Tổng Chi",
                itemStyle: { color: "#dc2626" },
              },
            ],
          },
        ],
      };
    }

    // 2. Biểu đồ Cột / Đường (Bar / Stack / Line)
    const labels = filteredRows.map((r) => r.label);
    const seriesList: Record<string, unknown>[] = [];

    const isStacked = chartType === "stack";
    const baseType = chartType === "line" ? "line" : "bar";

    if (showThu) {
      seriesList.push({
        name: "Thu",
        type: baseType,
        stack: isStacked ? "flow" : undefined,
        data: filteredRows.map((r) => r.thu),
        itemStyle: {
          color: "#16a34a",
          borderRadius: isStacked || baseType === "line" ? 0 : [4, 4, 0, 0],
        },
        smooth: smoothLine,
        areaStyle: chartType === "line" && fillArea ? { opacity: 0.15 } : undefined,
        emphasis: { focus: "series" },
      });
    }

    if (showChi) {
      seriesList.push({
        name: "Chi",
        type: baseType,
        stack: isStacked ? "flow" : undefined,
        data: filteredRows.map((r) => r.chi),
        itemStyle: {
          color: "#dc2626",
          borderRadius: isStacked || baseType === "line" ? 0 : [4, 4, 0, 0],
        },
        smooth: smoothLine,
        areaStyle: chartType === "line" && fillArea ? { opacity: 0.15 } : undefined,
        emphasis: { focus: "series" },
      });
    }

    if (showRong) {
      seriesList.push({
        name: "Ròng",
        type: chartType === "line" ? "line" : "bar",
        data: filteredRows.map((r) => r.rong),
        itemStyle: {
          color: "#2563eb",
          borderRadius: baseType === "line" ? 0 : [4, 4, 0, 0],
        },
        smooth: smoothLine,
        areaStyle: chartType === "line" && fillArea ? { opacity: 0.1 } : undefined,
        emphasis: { focus: "series" },
      });
    }

    if (showCheck) {
      seriesList.push({
        name: "Cần kiểm tra",
        type: "line",
        yAxisIndex: 1,
        data: filteredRows.map((r) => r.checkCount || 0),
        itemStyle: { color: "#f59e0b" },
        lineStyle: { type: "dashed", width: 2 },
        symbol: "circle",
        symbolSize: 6,
      });
    }

    const yAxes: Record<string, unknown>[] = [
      {
        type: "value",
        name: "Số tiền",
        axisLabel: {
          formatter: formatCompact,
        },
        splitLine: {
          lineStyle: { color: "#f1f5f9" },
        },
      },
    ];

    if (showCheck) {
      yAxes.push({
        type: "value",
        name: "Giao dịch",
        position: "right",
        minInterval: 1,
        splitLine: { show: false },
        axisLabel: {
          formatter: "{value} vụ",
        },
      });
    }

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: chartType === "line" ? "line" : "shadow" },
        valueFormatter: (value: number | undefined) =>
          value != null ? formatMoneyVND(value) : "—",
      },
      legend: {
        top: 0,
        icon: "roundRect",
        textStyle: { color: "#475569", fontSize: 12 },
      },
      grid: {
        left: 60,
        right: showCheck ? 60 : 25,
        top: 45,
        bottom: filteredRows.length > 7 ? 60 : 35,
      },
      toolbox: {
        feature: {
          magicType: {
            type: ["line", "bar", "stack"],
            title: { line: "Đường", bar: "Cột", stack: "Xếp chồng" },
          },
          dataZoom: { title: { zoom: "Vùng chọn", back: "Hoàn tác" } },
          restore: { title: "Đặt lại" },
          saveAsImage: { title: "Tải ảnh" },
        },
        iconStyle: { borderColor: "#64748b" },
      },
      dataZoom:
        filteredRows.length > 7
          ? [
              { type: "inside", start: 0, end: 100 },
              {
                type: "slider",
                bottom: 8,
                height: 20,
                borderColor: "#cbd5e1",
                fillerColor: "rgba(37, 99, 235, 0.1)",
                handleStyle: { color: "#2563eb" },
              },
            ]
          : [],
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#475569" },
      },
      yAxis: yAxes,
      series: seriesList,
    };
  }, [
    filteredRows,
    chartType,
    showThu,
    showChi,
    showRong,
    showCheck,
    smoothLine,
    fillArea,
  ]);

  if (!rows || rows.length === 0) {
    return (
      <section style={styles.container}>
        <div style={styles.header}>
          <div style={styles.titleWrap}>
            <span style={styles.title}>Minh hoạ số liệu</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, background: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1", color: "#64748b", fontSize: 14 }}>
          Chưa có dữ liệu tháng để vẽ biểu đồ.
        </div>
      </section>
    );
  }

  return (
    <section style={styles.container}>
      {/* Control Bar */}
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <span style={styles.title}>Minh hoạ số liệu</span>
          <span style={styles.subTitle}>
            ({filteredRows.length} tháng hiển thị)
          </span>
        </div>

        <div style={styles.controls}>
          {/* Chọn loại biểu đồ */}
          <div style={styles.controlGroup}>
            <span style={styles.label}>Dạng:</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              style={styles.select}
            >
              <option value="bar">Cột so sánh</option>
              <option value="stack">Cột xếp chồng</option>
              <option value="line">Đường xu hướng</option>
              <option value="pie">Tỷ trọng Thu/Chi</option>
            </select>
          </div>

          {/* Khoảng thời gian */}
          <div style={styles.controlGroup}>
            <span style={styles.label}>Kỳ:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              style={styles.select}
            >
              <option value="all">Tất cả</option>
              <option value="3">3 tháng gần nhất</option>
              <option value="6">6 tháng gần nhất</option>
              <option value="12">12 tháng gần nhất</option>
            </select>
          </div>

          {/* Bộ lọc series (chỉ hiện khi không phải pie) */}
          {chartType !== "pie" && (
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showThu}
                  onChange={(e) => setShowThu(e.target.checked)}
                />
                <span style={{ color: "#16a34a", fontWeight: 500 }}>Thu</span>
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showChi}
                  onChange={(e) => setShowChi(e.target.checked)}
                />
                <span style={{ color: "#dc2626", fontWeight: 500 }}>Chi</span>
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showRong}
                  onChange={(e) => setShowRong(e.target.checked)}
                />
                <span style={{ color: "#2563eb", fontWeight: 500 }}>Ròng</span>
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showCheck}
                  onChange={(e) => setShowCheck(e.target.checked)}
                />
                <span style={{ color: "#d97706", fontWeight: 500 }}>Cần KT</span>
              </label>
            </div>
          )}

          {/* Tùy chọn đường (chỉ hiện khi type là line) */}
          {chartType === "line" && (
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={smoothLine}
                  onChange={(e) => setSmoothLine(e.target.checked)}
                />
                <span>Làm mịn</span>
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={fillArea}
                  onChange={(e) => setFillArea(e.target.checked)}
                />
                <span>Đổ màu (Area)</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Vùng vẽ biểu đồ ECharts */}
      <div style={styles.chartWrapper}>
        <ReactECharts
          option={option}
          style={{ height: 380, width: "100%" }}
          notMerge
          lazyUpdate
        />
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "16px",
    borderBottom: "1px solid #e2e8f0",
    backgroundColor: "#ffffff",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 12,
  },
  titleWrap: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0f172a",
  },
  subTitle: {
    fontSize: 12,
    color: "#64748b",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
  },
  controlGroup: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 500,
  },
  select: {
    padding: "4px 8px",
    fontSize: 12,
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    outline: "none",
    cursor: "pointer",
  },
  checkboxGroup: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingLeft: 4,
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
  },
  chartWrapper: {
    width: "100%",
    minHeight: 380,
  },
};
