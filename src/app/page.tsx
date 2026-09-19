"use client";

import React from "react";
import Link from "next/link";
import type { ReportRow } from "@/lib/reports";

interface ReportPayload {
  months?: ReportRow[];
  today?: ReportRow | null;
  updatedAt?: string | null;
}

function formatMoney(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("vi-VN") + " đ";
}

function formatRong(v: string | number): React.ReactNode {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const color = n >= 0 ? "#15803d" : "#b91c1c";
  return <span style={{ color, fontWeight: 700 }}>{n.toLocaleString("vi-VN")} đ</span>;
}

export default function HomePage() {
  const [report, setReport] = React.useState<ReportPayload | null>(null);
  const [currentMonth, setCurrentMonth] = React.useState<ReportRow | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    txDate: new Date().toISOString().slice(0, 10),
    txType: "chi",
    amount: "",
    note: "",
  });

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/report?key=bao_cao_v2");
        const data = await res.json();
        setReport(data);
      } catch {}
    }
    load();
  }, []);

  React.useEffect(() => {
    if (report && report.months) {
      const now = new Date();
      const label = `${now.getMonth() + 1}/${now.getFullYear()}`;
      const monthData = report.months.find((m) => m.label.includes(label));
      setCurrentMonth(monthData || null);
    }
  }, [report]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });
    if (res.ok) {
      setForm({ ...form, amount: "", note: "" });
      setShowForm(false);
    } else {
      const d = await res.json();
      alert(d.error || "Không tạo được");
    }
  }

  return (
    <main style={{ padding: "24px clamp(16px, 3vw, 32px)", maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>Sổ Thu Chi</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/login" style={{ padding: "0.5rem 1rem", backgroundColor: "#2563eb", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: 14 }}>Đăng nhập</Link>
          <Link href="/dashboard" style={{ padding: "0.5rem 1rem", backgroundColor: "#10b981", color: "#fff", borderRadius: "6px", textDecoration: "none", fontSize: 14 }}>Báo cáo chi tiết</Link>
        </div>
      </div>

      {/* Tổng quan tháng này */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>
          Tháng này {currentMonth && <span style={{ fontSize: 14, fontWeight: 400, color: "#64748b" }}> · {currentMonth.label}</span>}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#15803d", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Thu</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{currentMonth ? formatMoney(currentMonth.thu) : "—"}</div>
          </div>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Chi</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>{currentMonth ? formatMoney(currentMonth.chi) : "—"}</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Ròng</div>
            {currentMonth ? formatRong(currentMonth.rong) : <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>—</div>}
          </div>
        </div>
        {(currentMonth?.checkCount ?? 0) > 0 && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, color: "#b45309", fontSize: 13, fontWeight: 500 }}>
            ⚠ Cần kiểm tra: {currentMonth?.checkCount} giao dịch
          </div>
        )}
      </section>

      {/* Ghi nhanh giao dịch */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Ghi nhanh giao dịch</h2>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: "8px 14px",
              background: showForm ? "#64748b" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {showForm ? "Đóng" : "Thêm giao dịch"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Ngày</span>
                <input
                  type="date"
                  required
                  value={form.txDate}
                  onChange={(e) => setForm({ ...form, txDate: e.target.value })}
                  style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Loại</span>
                <select
                  value={form.txType}
                  onChange={(e) => setForm({ ...form, txType: e.target.value })}
                  style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                >
                  <option value="chi">Chi</option>
                  <option value="thu">Thu</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Số tiền</span>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.amount ? Number(form.amount).toLocaleString("vi-VN") : ""}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, "") })}
                  placeholder="0"
                  style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                />
              </label>
              <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Ghi chú</span>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Mô tả giao dịch..."
                  style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                />
              </label>
            </div>
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Lưu giao dịch
            </button>
          </form>
        )}
      </section>

      {/* Gợi ý AI - placeholder */}
      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Gợi ý AI (tham khảo Google Sheet)</h2>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Chức năng phân tích tin nhắn Telegram/Email và đề xuất giao dịch sẽ được tích hợp ở Giai đoạn 2.
            Hiện tại vui lòng nhập thủ công ở trên hoặc vào <Link href="/transactions" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>Quản lý giao dịch</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}