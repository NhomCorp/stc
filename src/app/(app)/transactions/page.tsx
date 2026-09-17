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

type MasterItem = { id: number; name: string };

function formatMoney(n: string | number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("vi-VN") + " đ";
}

function resolveMasterId(list: MasterItem[], typed: string) {
  const t = typed.trim().toLowerCase();
  if (!t) return "";
  const exact = list.find((x) => x.name.toLowerCase() === t);
  if (exact) return String(exact.id);
  const partial = list.filter((x) => x.name.toLowerCase().includes(t));
  return partial.length === 1 ? String(partial[0].id) : "";
}

export default function TransactionsPage() {
  const [items, setItems] = useState<TxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [customerText, setCustomerText] = useState("");
  const [walletText, setWalletText] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<MasterItem[]>([]);
  const [wallets, setWallets] = useState<MasterItem[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    txDate: new Date().toISOString().slice(0, 10),
    txType: "chi",
    amount: "",
    note: "",
  });

  const customerId = resolveMasterId(customers, customerText);
  const walletId = resolveMasterId(wallets, walletText);
  const categoryId = resolveMasterId(categories, categoryText);

  async function loadMasters() {
    try {
      const [cus, wal, cat] = await Promise.all([
        fetch("/api/master?kind=customers"),
        fetch("/api/master?kind=wallets"),
        fetch("/api/master?kind=categories"),
      ]);
      const [cusData, walData, catData] = await Promise.all([
        cus.json(),
        wal.json(),
        cat.json(),
      ]);
      setCustomers(cusData.items || []);
      setWallets(walData.items || []);
      setCategories(catData.items || []);
    } catch {
      /* ignore */
    }
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q) params.set("q", q);
      if (type) params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (amountMin) params.set("amountMin", amountMin);
      if (amountMax) params.set("amountMax", amountMax);
      if (customerId) params.set("customerId", customerId);
      if (walletId) params.set("walletId", walletId);
      if (categoryId) params.set("categoryId", categoryId);
      if (status) params.set("status", status);
      const res = await fetch(`/api/transactions?${params}`);
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
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    load();
  }, [
    q,
    type,
    from,
    to,
    amountMin,
    amountMax,
    customerId,
    walletId,
    categoryId,
    status,
  ]);

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

  function clearFilters() {
    setQInput("");
    setQ("");
    setType("");
    setFrom("");
    setTo("");
    setAmountMin("");
    setAmountMax("");
    setCustomerText("");
    setWalletText("");
    setCategoryText("");
    setStatus("");
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={styles.pageHead}>
        <div>
          <h1 style={styles.title}>Giao dịch</h1>
          <p style={styles.subtitle}>{total.toLocaleString("vi-VN")} kết quả</p>
        </div>
        <div style={styles.headActions}>
          <button type="button" style={styles.ghostBtn} onClick={clearFilters}>
            Xoá lọc
          </button>
          <button
            type="button"
            style={styles.primary}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Đóng" : "Thêm giao dịch"}
          </button>
        </div>
      </div>

      <div style={styles.filterCard}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon} aria-hidden>
            ⌕
          </span>
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo ghi chú, đối tượng, ví, danh mục..."
            className="tx-filter-input"
            style={styles.search}
          />
        </div>

        <div style={styles.filterGrid}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Loại</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            >
              <option value="">Tất cả</option>
              <option value="thu">Thu</option>
              <option value="chi">Chi</option>
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Từ ngày</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Đến ngày</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Tiền từ</span>
            <input
              type="number"
              placeholder="0"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Tiền đến</span>
            <input
              type="number"
              placeholder="—"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            />
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Đối tượng</span>
            <input
              list="customer-list"
              value={customerText}
              onChange={(e) => setCustomerText(e.target.value)}
              placeholder="Tất cả"
              className="tx-filter-input"
              style={styles.control}
            />
            <datalist id="customer-list">
              {customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Ví</span>
            <input
              list="wallet-list"
              value={walletText}
              onChange={(e) => setWalletText(e.target.value)}
              placeholder="Tất cả"
              className="tx-filter-input"
              style={styles.control}
            />
            <datalist id="wallet-list">
              {wallets.map((w) => (
                <option key={w.id} value={w.name} />
              ))}
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Danh mục</span>
            <input
              list="category-list"
              value={categoryText}
              onChange={(e) => setCategoryText(e.target.value)}
              placeholder="Tất cả"
              className="tx-filter-input"
              style={styles.control}
            />
            <datalist id="category-list">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>Trạng thái</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="tx-filter-input"
              style={styles.control}
            >
              <option value="">Tất cả</option>
              <option value="ok">OK</option>
              <option value="pending">Pending</option>
              <option value="error">Lỗi</option>
            </select>
          </label>
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
        <div
          className="table-scroll"
          style={{ ...styles.card, padding: 0, overflowX: "auto" }}
        >
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
                    Không có giao dịch khớp bộ lọc.
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
  pageHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: "#0f172a",
  },
  subtitle: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: 13,
  },
  headActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  filterCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 16,
    marginTop: 14,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    color: "#94a3b8",
    fontSize: 16,
    pointerEvents: "none",
    lineHeight: 1,
  },
  search: {
    width: "100%",
    padding: "11px 12px 11px 34px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    fontSize: 14,
    background: "#f8fafc",
    color: "#0f172a",
    outline: "none",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 12,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#64748b",
  },
  control: {
    width: "100%",
    padding: "9px 11px",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 14,
    background: "#fff",
    color: "#0f172a",
    outline: "none",
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
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 14,
  },
  primary: {
    padding: "9px 14px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  ghostBtn: {
    padding: "9px 14px",
    background: "#fff",
    color: "#475569",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
};
