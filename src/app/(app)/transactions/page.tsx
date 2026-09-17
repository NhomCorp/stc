"use client";

import React, { useEffect, useState } from "react";

type TxItem = {
  id: number;
  txDate: string;
  txType: string;
  amount: string;
  note: string | null;
  status: string;
  sourceSheet: string;
  customerName: string | null;
  walletName: string | null;
  categoryName: string | null;
};

function formatMoney(n: string | number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("vi-VN") + " đ";
}

export default function TransactionsPage() {
  const [items, setItems] = useState<TxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<{id:number,name:string}[]>([]);
  const [wallets, setWallets] = useState<{id:number,name:string}[]>([]);
  const [categories, setCategories] = useState<{id:number,name:string}[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    txDate: new Date().toISOString().slice(0, 10),
    txType: "chi",
    amount: "",
    note: "",
  });

  async function loadMasters() {
    try {
      const [cus, wal, cat] = await Promise.all([
        fetch("/api/master?kind=customers"),
        fetch("/api/master?kind=wallets"),
        fetch("/api/master?kind=categories"),
      ]);
      const [cusData, walData, catData] = await Promise.all([
        cus.json(), wal.json(), cat.json(),
      ]);
      setCustomers(cusData.items || []);
      setWallets(walData.items || []);
      setCategories(catData.items || []);
    } catch {}
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ limit: "100" });
      if (type) q.set("type", type);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      if (amountMin) q.set("amountMin", amountMin);
      if (amountMax) q.set("amountMax", amountMax);
      if (customerId) q.set("customerId", customerId);
      if (walletId) q.set("walletId", walletId);
      if (categoryId) q.set("categoryId", categoryId);
      if (status) q.set("status", status);
      const res = await fetch(`/api/transactions?${q}`);
      if (!res.ok) throw new Error("Không tải được giao dịch");
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMasters();
  }, []);

  useEffect(() => {
    load();
  }, [type, from, to, amountMin, amountMax, customerId, walletId, categoryId, status]);

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
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Không tạo được");
      return;
    }
    setShowForm(false);
    setForm({ ...form, amount: "", note: "" });
    load();
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Giao dịch</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
            Tổng trong DB: {total} dòng
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={styles.select}
          >
            <option value="">Loại: Tất cả</option>
            <option value="thu">Thu</option>
            <option value="chi">Chi</option>
          </select>
          <input
            type="date"
            placeholder="Từ ngày"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={styles.select}
          />
          <input
            type="date"
            placeholder="Đến ngày"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={styles.select}
          />
          <input
            type="number"
            placeholder="Tiền tối thiểu"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            style={{ ...styles.select, width: 130 }}
          />
          <input
            type="number"
            placeholder="Tiền tối đa"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            style={{ ...styles.select, width: 130 }}
          />
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={styles.select}>
            <option value="">Đối tượng: Tất cả</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} style={styles.select}>
            <option value="">Ví: Tất cả</option>
            {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={styles.select}>
            <option value="">Danh mục: Tất cả</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.select}>
            <option value="">Trạng thái: Tất cả</option>
            <option value="ok">OK</option>
            <option value="pending">Pending</option>
            <option value="error">Lỗi</option>
          </select>
          <button
            type="button"
            style={styles.primary}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Đóng" : "Thêm giao dịch"}
          </button>
          <button
            type="button"
            style={{ ...styles.primary, background: "#64748b" }}
            onClick={() => {
              setType(""); setFrom(""); setTo(""); setAmountMin(""); setAmountMax("");
              setCustomerId(""); setWalletId(""); setCategoryId(""); setStatus("");
            }}
          >
            Xoá bộ lọc
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={styles.card}>
          <div style={styles.formGrid}>
            <label>
              Ngày
              <input
                type="date"
                required
                value={form.txDate}
                onChange={(e) => setForm({ ...form, txDate: e.target.value })}
                style={styles.input}
              />
            </label>
            <label>
              Loại
              <select
                value={form.txType}
                onChange={(e) => setForm({ ...form, txType: e.target.value })}
                style={styles.input}
              >
                <option value="chi">Chi</option>
                <option value="thu">Thu</option>
              </select>
            </label>
            <label>
              Số tiền
              <input
                type="number"
                required
                min={1}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                style={styles.input}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Ghi chú
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={styles.input}
              />
            </label>
          </div>
          <button type="submit" style={{ ...styles.primary, marginTop: 12 }}>
            Lưu
          </button>
        </form>
      )}

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div style={{ ...styles.card, padding: 0, overflowX: "auto" }}>
          <style>{`
            table.tx-table th, table.tx-table td {
              padding: 10px 12px;
              border-bottom: 1px solid #f1f5f9;
              text-align: left;
              white-space: nowrap;
            }
            table.tx-table th { background: #f8fafc; font-size: 12px; color: #64748b; }
          `}</style>
          <table className="tx-table" style={styles.table}>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Loại</th>
                <th>Số tiền</th>
                <th>Đối tượng</th>
                <th>Ví</th>
                <th>Danh mục</th>
                <th>Ghi chú</th>
                <th>Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.txDate).toLocaleDateString("vi-VN")}</td>
                  <td
                    style={{
                      color: t.txType === "thu" ? "#15803d" : "#b91c1c",
                      fontWeight: 600,
                    }}
                  >
                    {t.txType === "thu" ? "Thu" : "Chi"}
                  </td>
                  <td>{formatMoney(t.amount)}</td>
                  <td>{t.customerName || "—"}</td>
                  <td>{t.walletName || "—"}</td>
                  <td>{t.categoryName || "—"}</td>
                  <td>{t.note || "—"}</td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>
                    {t.sourceSheet}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{ textAlign: "center", padding: 24, color: "#64748b" }}
                  >
                    Chưa có giao dịch. Vào trang Import để nạp Log.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  input: {
    display: "block",
    width: "100%",
    marginTop: 4,
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  },
  select: {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    fontSize: 14,
  },
  primary: {
    padding: "8px 14px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
};
