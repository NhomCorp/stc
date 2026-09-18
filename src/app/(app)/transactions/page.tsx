"use client";

import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
  Search,
  Filter,
  FilterX,
  Plus,
  Loader2,
  Calendar,
  DollarSign,
  Tag,
  Hash,
  AlertCircle,
  CheckCircle2,
  ListFilter,
  Copy,
} from "lucide-react";

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
  return v.toLocaleString("vi-VN") + " ₫";
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

  const [customers, setCustomers] = useState<MasterItem[]>([]);
  const [wallets, setWallets] = useState<MasterItem[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [form, setForm] = useState({
    txDate: new Date().toISOString().slice(0, 10),
    txType: "chi",
    amount: "",
    note: "",
    customerId: "",
    walletId: "",
    categoryId: "",
  });
  
  const formRef = useRef<HTMLFormElement>(null);

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
      toast.error("Không tải được danh mục");
    }
  }

  async function load() {
    setLoading(true);
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
      toast.error(e instanceof Error ? e.message : "Lỗi tải giao dịch");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMasters();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    load();
  }, [
    q, type, from, to, amountMin, amountMax,
    customerId, walletId, categoryId, status,
  ]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const loadingToast = toast.loading("Đang lưu giao dịch...");
    
    try {
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
        throw new Error(d.error || "Không tạo được");
      }
      
      toast.success("Đã thêm giao dịch thành công", { id: loadingToast });
      setShowForm(false);
      setForm({ ...form, amount: "", note: "", customerId: "", walletId: "", categoryId: "" });
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi", { id: loadingToast });
    }
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
    toast.success("Đã xoá bộ lọc");
  }
  
  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Đã copy", { duration: 1500 });
  }

  return (
    <div style={styles.page}>
      <div style={styles.pageHead}>
        <div>
          <h1 style={styles.title}>Giao dịch</h1>
          <p style={styles.subtitle}>
            {total.toLocaleString("vi-VN")} kết quả {loading && <Loader2 size={12} style={{ display: 'inline', animation: 'spin 1s linear infinite' }} />}
          </p>
        </div>
        <div style={styles.headActions}>
          <button 
            type="button" 
            className="btn-ghost" 
            onClick={() => setShowFilters(!showFilters)}
            title="Hiện/Ẩn bộ lọc chi tiết"
          >
            <ListFilter size={16} />
            <span>Lọc</span>
          </button>
          <button type="button" className="btn-ghost" onClick={clearFilters}>
            <FilterX size={16} />
            <span className="hidden-mobile">Xoá lọc</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }}
          >
            <Plus size={16} />
            <span>{showForm ? "Đóng form" : "Thêm"}</span>
          </button>
        </div>
      </div>

      <div className="card-container" style={{ padding: 16, marginTop: 16 }}>
        <div style={styles.searchWrap}>
          <Search size={18} style={styles.searchIcon} />
          <input
            type="search"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Tìm theo ghi chú, đối tượng, ví, danh mục..."
            className="tx-filter-input"
            style={styles.search}
          />
        </div>

        {showFilters && (
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
              <select
                value={customerText}
                onChange={(e) => setCustomerText(e.target.value)}
                className="tx-filter-input"
                style={styles.control}
              >
                <option value="">Tất cả</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ví</span>
              <select
                value={walletText}
                onChange={(e) => setWalletText(e.target.value)}
                className="tx-filter-input"
                style={styles.control}
              >
                <option value="">Tất cả</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.name}>{w.name}</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Danh mục</span>
              <select
                value={categoryText}
                onChange={(e) => setCategoryText(e.target.value)}
                className="tx-filter-input"
                style={styles.control}
              >
                <option value="">Tất cả</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
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
        )}
      </div>

      {showForm && (
        <form ref={formRef} onSubmit={handleCreate} className="card-container" style={{ padding: 20, marginTop: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16 }}>Thêm giao dịch mới</h3>
          <div style={styles.formGrid}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ngày</span>
              <input
                type="date"
                required
                value={form.txDate}
                onChange={(e) => setForm({ ...form, txDate: e.target.value })}
                className="form-input"
                style={styles.control}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Loại</span>
              <select
                value={form.txType}
                onChange={(e) => setForm({ ...form, txType: e.target.value })}
                className="form-input"
                style={styles.control}
              >
                <option value="chi">Chi</option>
                <option value="thu">Thu</option>
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Số tiền</span>
              <input
                type="number"
                required
                min={1}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="form-input"
                style={styles.control}
              />
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Ví</span>
              <select
                value={form.walletId}
                onChange={(e) => setForm({ ...form, walletId: e.target.value })}
                className="form-input"
                style={styles.control}
              >
                <option value="">-- Chọn ví --</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Đối tượng</span>
              <select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                className="form-input"
                style={styles.control}
              >
                <option value="">-- Chọn đối tượng --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Danh mục</span>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="form-input"
                style={styles.control}
              >
                <option value="">-- Chọn danh mục --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label style={{ ...styles.field, gridColumn: "1 / -1" }}>
              <span style={styles.fieldLabel}>Ghi chú</span>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Nhập ghi chú giao dịch..."
                className="form-input"
                style={styles.control}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
              Huỷ
            </button>
            <button type="submit" className="btn-primary">
              <CheckCircle2 size={16} />
              <span>Lưu giao dịch</span>
            </button>
          </div>
        </form>
      )}

      <div
        className="card-container"
        style={{ marginTop: 16, padding: 0, overflowX: "auto" }}
      >
        <style>{`
          table.tx-table th, table.tx-table td {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            text-align: left;
            white-space: nowrap;
          }
          table.tx-table th { background: var(--muted); font-size: 13px; color: var(--muted-foreground); font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
          .tx-row:hover { background: var(--muted); }
          .tx-row { transition: background 0.15s; }
          .copy-btn { opacity: 0; background: transparent; border: none; cursor: pointer; color: var(--muted-foreground); padding: 4px; border-radius: 4px; margin-left: 4px; display: inline-flex; }
          .tx-row:hover .copy-btn { opacity: 1; }
          .copy-btn:hover { background: var(--border); color: var(--foreground); }
          @media (max-width: 600px) {
            .hidden-mobile { display: none; }
          }
        `}</style>
        <table className="tx-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>Ngày</th>
              <th style={{ textAlign: "center" }}>Loại</th>
              <th style={{ textAlign: "right" }}>Số tiền</th>
              <th>Đối tượng</th>
              <th>Ví</th>
              <th>Danh mục</th>
              <th>Ghi chú</th>
              <th style={{ textAlign: "center" }}>Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}
                >
                  <FilterX size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  Không có giao dịch khớp bộ lọc.
                </td>
              </tr>
            ) : (
              items.map((t) => (
                <tr key={t.id} className="tx-row" style={t.status !== 'ok' ? { backgroundColor: 'var(--muted)' } : {}}>
                  <td style={{ textAlign: "center" }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Calendar size={14} color="var(--muted-foreground)" />
                      <span>{new Date(t.txDate).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      backgroundColor: t.txType === "thu" ? '#dcfce7' : '#fee2e2',
                      color: t.txType === "thu" ? '#16a34a' : '#dc2626',
                    }}>
                      {t.txType === "thu" ? "Thu" : "Chi"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: "var(--foreground)", textAlign: "right" }}>
                    {t.txType === "thu" ? "+" : "-"}{formatMoney(t.amount)}
                  </td>
                  <td>{t.customerName || "—"}</td>
                  <td>{t.walletName || "—"}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.categoryName && <Tag size={14} color="var(--muted-foreground)" />}
                      <span>{t.categoryName || "—"}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span title={t.note || ""}>{t.note || "—"}</span>
                      {t.note && (
                        <button type="button" className="copy-btn" onClick={() => copyText(t.note!)} title="Copy">
                          <Copy size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted-foreground)", textAlign: "center" }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Hash size={12} />
                      <span title={t.sourceSheet}>{t.sourceSheet.length > 15 ? t.sourceSheet.substring(0, 15) + "..." : t.sourceSheet}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    width: "100%",
  },
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
    color: "var(--foreground)",
  },
  subtitle: {
    margin: "4px 0 0",
    color: "var(--muted-foreground)",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  headActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  searchWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    color: "var(--muted-foreground)",
    pointerEvents: "none",
  },
  search: {
    width: "100%",
    padding: "11px 12px 11px 38px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    background: "var(--background)",
    outline: "none",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTop: "1px dashed var(--border)",
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
    color: "var(--muted-foreground)",
  },
  control: {
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    fontSize: 14,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 16,
  },
};
