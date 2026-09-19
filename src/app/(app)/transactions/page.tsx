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
  CheckCircle2,
  ListFilter,
  Copy,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  LayoutList,
  Table as TableIcon,
  CreditCard,
  Banknote,
  Smartphone,
  CheckSquare,
  X
} from "lucide-react";

type TxItem = {
  id: number;
  txDate: string;
  txType: string;
  amount: string;
  note: string | null;
  status: string;
  sourceSheet: string;
  customerId: number | null;
  walletId: number | null;
  categoryId: number | null;
  customerName: string | null;
  walletName: string | null;
  categoryName: string | null;
};

type MasterItem = { id: number; name: string };

function formatMoney(n: string | number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return v.toLocaleString("vi-VN");
}

function resolveMasterId(list: MasterItem[], typed: string) {
  const t = typed.trim().toLowerCase();
  if (!t) return "";
  const exact = list.find((x) => x.name.toLowerCase() === t);
  if (exact) return String(exact.id);
  const partial = list.filter((x) => x.name.toLowerCase().includes(t));
  return partial.length === 1 ? String(partial[0].id) : "";
}

function getWalletIcon(walletName: string | null) {
  if (!walletName) return <CreditCard size={12} />;
  const name = walletName.toLowerCase();
  if (name.includes("momo") || name.includes("zalopay") || name.includes("vi")) return <Smartphone size={12} />;
  if (name.includes("tiền mặt") || name.includes("cash")) return <Banknote size={12} />;
  return <CreditCard size={12} />;
}

export default function TransactionsPage() {
  const [items, setItems] = useState<TxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
    return firstDay.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
    return lastDay.toISOString().slice(0, 10);
  });
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [customerText, setCustomerText] = useState("");
  const [walletText, setWalletText] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "feed">("feed");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [customers, setCustomers] = useState<MasterItem[]>([]);
  const [wallets, setWallets] = useState<MasterItem[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);

  // Popup logic
  const [popupTxId, setPopupTxId] = useState<number | null>(null);
  const [popupData, setPopupData] = useState<TxItem | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupIsEditing, setPopupIsEditing] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
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
      const params = new URLSearchParams({ limit: String(pageSize), offset: String((page - 1) * pageSize) });
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
      setTotalIncome(data.totalIncome || 0);
      setTotalExpense(data.totalExpense || 0);
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
    const urlParams = new URLSearchParams(window.location.search);
    const txIdStr = urlParams.get("transaction");
    if (txIdStr) {
      const id = parseInt(txIdStr, 10);
      if (!Number.isNaN(id)) {
        setPopupTxId(id);
      }
    }
  }, []);

  useEffect(() => {
    async function loadPopupData(id: number) {
      setPopupLoading(true);
      try {
        const res = await fetch(`/api/transactions?id=${id}&limit=1`);
        if (!res.ok) throw new Error("Không tải được");
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setPopupData(data.items[0]);
        } else {
          toast.error("Không tìm thấy giao dịch này");
          setPopupTxId(null);
        }
      } catch (err) {
        toast.error("Lỗi tải chi tiết giao dịch");
        setPopupTxId(null);
      } finally {
        setPopupLoading(false);
      }
    }

    if (popupTxId) {
      const existing = items.find(i => i.id === popupTxId);
      if (existing) {
        setPopupData(existing);
      } else {
        loadPopupData(popupTxId);
      }
    } else {
      setPopupData(null);
      setPopupIsEditing(false);
      // Remove query param safely without page reload
      const url = new URL(window.location.href);
      if (url.searchParams.has("transaction")) {
        url.searchParams.delete("transaction");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [popupTxId, items]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [q, type, from, to, amountMin, amountMax, customerId, walletId, categoryId, status, pageSize]);

  useEffect(() => {
    load();
  }, [
    q, type, from, to, amountMin, amountMax,
    customerId, walletId, categoryId, status, page, pageSize,
  ]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const isPut = !!editingId || popupIsEditing;
    const updateId = popupIsEditing ? popupTxId : editingId;
    const loadingToast = toast.loading(isPut ? "Đang cập nhật..." : "Đang lưu giao dịch...");
    
    try {
      const res = await fetch("/api/transactions", {
        method: isPut ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isPut ? { id: updateId } : {}),
          ...form,
          amount: Number(form.amount),
        }),
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || (isPut ? "Không cập nhật được" : "Không tạo được"));
      }
      
      const resData = await res.json();
      
      toast.success(isPut ? "Đã cập nhật giao dịch" : "Đã thêm giao dịch thành công", { id: loadingToast });
      setShowForm(false);
      setEditingId(null);
      setForm({ ...form, amount: "", note: "", customerId: "", walletId: "", categoryId: "" });
      
      if (popupIsEditing) {
        setPopupIsEditing(false);
        // Cập nhật popupData ngay lập tức để không phải chờ load() xong
        // Mặc dù load() cũng sẽ làm mới items
        if (resData.item) {
          const freshItem = {
            ...popupData,
            ...resData.item,
            customerName: customers.find(c => c.id === resData.item.customerId)?.name || null,
            walletName: wallets.find(w => w.id === resData.item.walletId)?.name || null,
            categoryName: categories.find(c => c.id === resData.item.categoryId)?.name || null,
          } as TxItem;
          setPopupData(freshItem);
        }
      }
      
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi", { id: loadingToast });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bạn có chắc chắn muốn xoá giao dịch này?")) return;
    
    const loadingToast = toast.loading("Đang xoá giao dịch...");
    try {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Không xoá được");
      }
      
      toast.success("Đã xoá giao dịch", { id: loadingToast });
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lỗi", { id: loadingToast });
    }
  }

  function handleEditClick(item: TxItem, fromDetail = false) {
    if (fromDetail) {
      setPopupTxId(item.id);
      setPopupIsEditing(true);
    } else {
      setEditingId(item.id);
      setShowForm(true);
    }
    setForm({
      txDate: item.txDate ? new Date(item.txDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      txType: item.txType,
      amount: item.amount ? String(Number(item.amount)) : "",
      note: item.note || "",
      customerId: item.customerId ? String(item.customerId) : "",
      walletId: item.walletId ? String(item.walletId) : "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
    });
  }

  function handleDuplicate(item: TxItem) {
    setEditingId(null);
    setPopupTxId(null);
    setPopupIsEditing(false);
    setForm({
      txDate: new Date().toISOString().slice(0, 10),
      txType: item.txType,
      amount: item.amount ? String(Number(item.amount)) : "",
      note: item.note || "",
      customerId: item.customerId ? String(item.customerId) : "",
      walletId: item.walletId ? String(item.walletId) : "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
    });
    setShowForm(true);
  }

  function handleRowClick(item: TxItem) {
    setPopupTxId(item.id);
    setPopupIsEditing(false);
  }

  function handleCancelForm() {
    if (popupIsEditing) setPopupIsEditing(false);
    setShowForm(false);
    setEditingId(null);
    setForm({ ...form, amount: "", note: "", customerId: "", walletId: "", categoryId: "" });
  }

  function clearFilters() {
    setQInput("");
    setQ("");
    setType("");
    
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
    lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
    setFrom(firstDay.toISOString().slice(0, 10));
    setTo(lastDay.toISOString().slice(0, 10));
    
    setAmountMin("");
    setAmountMax("");
    setCustomerText("");
    setWalletText("");
    setCategoryText("");
    setStatus("");
    toast.success("Đã xoá bộ lọc");
  }
  
  function setQuickFilter(filter: string) {
    if (filter === "all") {
      clearFilters();
    } else if (filter === "chi") {
      clearFilters();
      setType("chi");
    } else if (filter === "thu") {
      clearFilters();
      setType("thu");
    } else if (filter === "today") {
      clearFilters();
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      const todayStr = today.toISOString().slice(0, 10);
      setFrom(todayStr);
      setTo(todayStr);
    } else if (filter === "month") {
      clearFilters();
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
      lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
      
      setFrom(firstDay.toISOString().slice(0, 10));
      setTo(lastDay.toISOString().slice(0, 10));
    }
  }
  
  function navigateMonth(direction: 'prev' | 'next') {
    let baseDate = from ? new Date(from) : new Date();
    baseDate.setMonth(baseDate.getMonth() + (direction === 'prev' ? -1 : 1));
    const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
    firstDay.setMinutes(firstDay.getMinutes() - firstDay.getTimezoneOffset());
    lastDay.setMinutes(lastDay.getMinutes() - lastDay.getTimezoneOffset());
    setFrom(firstDay.toISOString().slice(0, 10));
    setTo(lastDay.toISOString().slice(0, 10));
  }

  function getCurrentMonthDisplay() {
    if (!from || !to) return "Tất cả thời gian";
    const fDate = new Date(from);
    const tDate = new Date(to);
    if (fDate.getMonth() === tDate.getMonth() && fDate.getFullYear() === tDate.getFullYear()) {
      return `Tháng ${fDate.getMonth() + 1}, ${fDate.getFullYear()}`;
    }
    return "Tùy chỉnh";
  }

  const MonthNavigator = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--muted)', borderRadius: 12, marginBottom: 16 }}>
      <button type="button" className="btn-ghost" onClick={() => navigateMonth('prev')} style={{ fontWeight: 500 }}>
        &lt; Tháng trước
      </button>
      <div style={{ fontWeight: 600 }}>{getCurrentMonthDisplay()}</div>
      <button type="button" className="btn-ghost" onClick={() => navigateMonth('next')} style={{ fontWeight: 500 }}>
        Tháng sau &gt;
      </button>
    </div>
  );

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Đã copy", { duration: 1500 });
  }

  // Group items by date
  const groupedItems = items.reduce((acc, item) => {
    const date = new Date(item.txDate).toLocaleDateString("vi-VN");
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {} as Record<string, TxItem[]>);
  
  const sortedDates = Object.keys(groupedItems).sort((a, b) => {
    const dateA = a.split('/').reverse().join('-');
    const dateB = b.split('/').reverse().join('-');
    return dateB.localeCompare(dateA);
  });

  const getDayLabel = (dateStr: string) => {
    const today = new Date().toLocaleDateString("vi-VN");
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("vi-VN");
    if (dateStr === today) return `Hôm nay – ${dateStr}`;
    if (dateStr === yesterday) return `Hôm qua – ${dateStr}`;
    return dateStr;
  };

  const getDaySummary = (dayItems: TxItem[]) => {
    const dayIncome = dayItems.filter(i => i.txType === 'thu').reduce((sum, i) => sum + Number(i.amount), 0);
    const dayExpense = dayItems.filter(i => i.txType === 'chi').reduce((sum, i) => sum + Number(i.amount), 0);
    if (dayExpense > 0 && dayIncome > 0) return `Thu: +${formatMoney(dayIncome)} ₫ | Chi: -${formatMoney(dayExpense)} ₫`;
    if (dayIncome > 0) return `Tổng thu: +${formatMoney(dayIncome)} ₫`;
    if (dayExpense > 0) return `Tổng chi: -${formatMoney(dayExpense)} ₫`;
    return "";
  };

  const netFlow = totalIncome - totalExpense;

  return (
    <div style={styles.page}>
      <style>{`
        .tx-filter-input, .form-input {
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
        }
        .tx-filter-input:focus, .form-input:focus {
          border-color: var(--primary);
          outline: none;
        }
        .mini-card {
          flex: 1;
          min-width: 250px;
          padding: 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .mini-card-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .summary-title {
          font-size: 13px;
          font-weight: 500;
          opacity: 0.8;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 20px;
          font-weight: 700;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .chip {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--background);
          color: var(--foreground);
          transition: all 0.2s;
          white-space: nowrap;
        }
        .chip:hover {
          background: var(--muted);
        }
        .chip.active {
          background: var(--foreground);
          color: var(--background);
          border-color: var(--foreground);
        }
        
        .tx-amount {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          white-space: nowrap;
          font-weight: 700;
        }
        .tx-amount.thu {
          color: #16a34a;
          font-weight: 700;
        }
        .tx-amount.chi {
          color: #dc2626;
        }
        [data-theme="dark"] .tx-amount.thu {
          color: #4ade80;
        }
        [data-theme="dark"] .tx-amount.chi {
          color: #f87171;
        }
        
        .wallet-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          border: 1px solid var(--border);
          font-size: 13px;
          font-weight: 600;
          color: var(--foreground);
          background: var(--muted);
        }
        
        /* Feed View Styles */
        .feed-group {
          margin-bottom: 24px;
        }
        .feed-group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          margin-bottom: 12px;
          border-bottom: 2px solid var(--border);
        }
        .feed-date {
          font-weight: 700;
          font-size: 16px;
          color: var(--foreground);
        }
        .feed-summary {
          font-size: 14px;
          font-weight: 600;
          color: var(--muted-foreground);
        }
        .feed-item {
          display: flex;
          align-items: center;
          padding: 14px 18px;
          border-radius: 12px;
          background: var(--card);
          border: 1px solid var(--border);
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          transition: all 0.2s;
          position: relative;
        }
        .feed-item:hover {
          background: var(--muted);
          border-color: var(--primary);
        }
        .feed-icon {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 16px;
          flex-shrink: 0;
        }
        .feed-icon.thu {
          background: rgba(22, 163, 74, 0.18);
          color: #16a34a;
        }
        .feed-icon.chi {
          background: rgba(220, 38, 38, 0.18);
          color: #dc2626;
        }
        [data-theme="dark"] .feed-icon.thu {
          background: rgba(74, 222, 128, 0.2);
          color: #4ade80;
        }
        [data-theme="dark"] .feed-icon.chi {
          background: rgba(248, 113, 113, 0.2);
          color: #f87171;
        }
        .feed-content {
          flex: 1;
          min-width: 0;
        }
        .feed-title {
          font-weight: 700;
          font-size: 16px;
          color: var(--foreground);
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .feed-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--muted-foreground);
          flex-wrap: wrap;
        }
        .feed-right {
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .feed-actions {
          opacity: 0;
          transition: opacity 0.2s;
          display: flex;
          gap: 4px;
        }
        .feed-item:hover .feed-actions, .tx-row:hover .feed-actions {
          opacity: 1;
        }
        .feed-action-btn {
          background: transparent;
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--muted-foreground);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .feed-action-btn:hover {
          background: var(--border);
          color: var(--foreground);
        }

        /* Drawer Styles */
        .drawer-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1000;
          backdrop-filter: blur(2px);
          display: flex;
          justify-content: flex-end;
          animation: fadeIn 0.15s ease-out;
        }
        .drawer-content {
          background: var(--card);
          border-left: 1px solid var(--border);
          width: 100%;
          max-width: 460px;
          height: 100%;
          overflow-y: auto;
          box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        /* Popup Styles */
        .popup-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
          backdrop-filter: blur(2px);
        }
        .popup-content {
          background: var(--background);
          border-radius: 16px;
          width: 100%;
          max-width: 500px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
        }
        .popup-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .popup-body {
          padding: 20px;
        }
        
        /* Table Styles */
        table.tx-table th, table.tx-table td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          text-align: left;
          white-space: nowrap;
        }
        table.tx-table th { background: var(--muted); font-size: 14px; color: var(--muted-foreground); font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; position: sticky; top: 0; z-index: 2; }
        .tx-row:hover { background: var(--muted); }
        .tx-row { transition: background 0.15s; }
        .copy-btn { opacity: 0; background: transparent; border: none; cursor: pointer; color: var(--muted-foreground); padding: 4px; border-radius: 4px; margin-left: 4px; display: inline-flex; }
        .tx-row:hover .copy-btn { opacity: 1; }
        .copy-btn:hover { background: var(--border); color: var(--foreground); }
        .text-right { text-align: right !important; }
        @media (max-width: 600px) {
          .hidden-mobile { display: none; }
          .mini-card { min-width: 100%; }
        }
      `}</style>
      
      <div style={styles.pageHead}>
        <div>
          <h1 style={styles.title}>Giao dịch</h1>
          <p style={styles.subtitle}>
            {total.toLocaleString("vi-VN")} kết quả {loading && <Loader2 size={12} style={{ display: 'inline', animation: 'spin 1s linear infinite' }} />}
          </p>
        </div>
        <div style={styles.headActions}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ ...styles.searchWrap, minWidth: 200, margin: 0 }}>
              <Search size={18} style={styles.searchIcon} />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Tìm ghi chú, đối tượng..."
                className="tx-filter-input"
                style={{ ...styles.search, width: '100%' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap' }}>
              <div className={`chip ${!type && !from && !to ? 'active' : ''}`} onClick={() => setQuickFilter('all')}>Tất cả</div>
              <div className={`chip ${type === 'chi' ? 'active' : ''}`} onClick={() => setQuickFilter('chi')}>Chi</div>
              <div className={`chip ${type === 'thu' ? 'active' : ''}`} onClick={() => setQuickFilter('thu')}>Thu</div>
              <div className={`chip ${from === new Date().toISOString().slice(0, 10) && to === new Date().toISOString().slice(0, 10) ? 'active' : ''}`} onClick={() => setQuickFilter('today')}>Hôm nay</div>
              <div className={`chip ${from && to && from !== to && new Date(from).getDate() === 1 ? 'active' : ''}`} onClick={() => setQuickFilter('month')}>Tháng này</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--muted)', borderRadius: 8, padding: 2 }}>
              <button
                type="button"
                style={{
                  background: viewMode === 'feed' ? 'var(--background)' : 'transparent',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: viewMode === 'feed' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  color: viewMode === 'feed' ? 'var(--foreground)' : 'var(--muted-foreground)'
                }}
                onClick={() => setViewMode('feed')}
                title="Danh sách"
              >
                <LayoutList size={16} />
                <span className="hidden-mobile" style={{ fontSize: 13, fontWeight: 500 }}>Danh sách</span>
              </button>
              <button
                type="button"
                style={{
                  background: viewMode === 'table' ? 'var(--background)' : 'transparent',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  color: viewMode === 'table' ? 'var(--foreground)' : 'var(--muted-foreground)'
                }}
                onClick={() => setViewMode('table')}
                title="Bảng"
              >
                <TableIcon size={16} />
                <span className="hidden-mobile" style={{ fontSize: 13, fontWeight: 500 }}>Bảng</span>
              </button>
            </div>
            
            <button 
              type="button" 
              className="btn-ghost" 
              onClick={() => setShowFilters(!showFilters)}
              title="Lọc nâng cao"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ListFilter size={16} />
              <span className="hidden-mobile">Lọc nâng cao</span>
            </button>
            
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                handleCancelForm();
                setShowForm(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} />
              <span>Thêm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mini Summary Cards */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <div className="mini-card" style={{ background: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.2)' }}>
          <div className="mini-card-icon" style={{ background: 'rgba(22, 163, 74, 0.2)', color: '#16a34a' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="summary-title" style={{ color: '#16a34a' }}>Tổng thu</div>
            <div className="summary-value" style={{ color: '#16a34a' }}>+{formatMoney(totalIncome)} ₫</div>
          </div>
        </div>
        
        <div className="mini-card" style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)' }}>
          <div className="mini-card-icon" style={{ background: 'rgba(220, 38, 38, 0.2)', color: '#dc2626' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <div className="summary-title" style={{ color: '#dc2626' }}>Tổng chi</div>
            <div className="summary-value" style={{ color: '#dc2626' }}>-{formatMoney(totalExpense)} ₫</div>
          </div>
        </div>
        
        <div className="mini-card" style={{ 
          background: netFlow > 0 ? 'rgba(22, 163, 74, 0.1)' : (netFlow < 0 ? 'rgba(220, 38, 38, 0.1)' : 'var(--muted)'), 
          border: netFlow > 0 ? '1px solid rgba(22, 163, 74, 0.2)' : (netFlow < 0 ? '1px solid rgba(220, 38, 38, 0.2)' : '1px solid var(--border)') 
        }}>
          <div className="mini-card-icon" style={{ 
            background: netFlow > 0 ? 'rgba(22, 163, 74, 0.2)' : (netFlow < 0 ? 'rgba(220, 38, 38, 0.2)' : 'var(--background)'), 
            color: netFlow > 0 ? '#16a34a' : (netFlow < 0 ? '#dc2626' : 'var(--foreground)') 
          }}>
            <DollarSign size={24} />
          </div>
          <div>
            <div className="summary-title" style={{ color: netFlow > 0 ? '#16a34a' : (netFlow < 0 ? '#dc2626' : 'var(--foreground)') }}>Dòng tiền ròng (Net)</div>
            <div className="summary-value" style={{ color: netFlow > 0 ? '#16a34a' : (netFlow < 0 ? '#dc2626' : 'var(--foreground)') }}>
              {netFlow > 0 ? '+' : ''}{formatMoney(netFlow)} ₫
            </div>
          </div>
        </div>
      </div>

      <div className="card-container" style={{ padding: 16, marginTop: 16, borderTop: showFilters ? 'none' : undefined, borderRadius: showFilters ? '0 0 12px 12px' : 12 }}>
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
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amountMin ? Number(amountMin).toLocaleString("vi-VN") : ""}
                onChange={(e) => setAmountMin(e.target.value.replace(/[^\d]/g, ""))}
                className="tx-filter-input"
                style={styles.control}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Tiền đến</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="—"
                value={amountMax ? Number(amountMax).toLocaleString("vi-VN") : ""}
                onChange={(e) => setAmountMax(e.target.value.replace(/[^\d]/g, ""))}
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

      {(showForm || popupIsEditing) && (
        <div className="drawer-overlay" onMouseDown={handleCancelForm}>
        <form ref={formRef} onSubmit={handleCreate} className="drawer-content" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 20, fontSize: 18, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
            {(editingId || popupIsEditing) ? `Chỉnh sửa giao dịch #${popupTxId || editingId}` : "Thêm giao dịch mới"}
          </h3>
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
                type="text"
                inputMode="numeric"
                required
                autoFocus
                value={form.amount ? Number(form.amount).toLocaleString("vi-VN") : ""}
                onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, "") })}
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
            <button type="button" className="btn-ghost" onClick={handleCancelForm}>
              Huỷ
            </button>
            <button type="submit" className="btn-primary">
              <CheckCircle2 size={16} />
              <span>{(editingId || popupIsEditing) ? "Cập nhật giao dịch" : "Lưu giao dịch"}</span>
            </button>
          </div>
        </form>
        </div>
      )}

      {popupTxId && popupData && !popupIsEditing && !showForm && (
        <div className="popup-overlay" onMouseDown={() => setPopupTxId(null)}>
          <div className="popup-content" onMouseDown={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h3 style={{ margin: 0, fontSize: 18 }}>Chi tiết giao dịch #{popupData.id}</h3>
              <button type="button" className="feed-action-btn" onClick={() => setPopupTxId(null)}><X size={20} /></button>
            </div>
            <div className="popup-body">
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Ngày</b><span>{new Date(popupData.txDate).toLocaleDateString("vi-VN")}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Loại</b><span style={{ color: popupData.txType === "thu" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{popupData.txType === "thu" ? "Thu" : "Chi"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Số tiền</b><strong className={`tx-amount ${popupData.txType}`}>{popupData.txType === "thu" ? "+" : "-"}{formatMoney(popupData.amount)} ₫</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Ví</b><span>{popupData.walletName || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Đối tượng</b><span>{popupData.customerName || "—"}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><b>Danh mục</b><span>{popupData.categoryName || "—"}</span></div>
                <div><b>Ghi chú</b><p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{popupData.note || "—"}</p></div>
                <div><b>Trạng thái</b><p style={{ margin: "6px 0 0", color: popupData.status === "ok" ? "#16a34a" : "#b45309" }}>{popupData.status}</p></div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
                <button type="button" className="btn-ghost" onClick={() => handleDelete(popupData.id)}>Xóa</button>
                <button type="button" className="btn-primary" onClick={() => handleEditClick(popupData, true)}><Edit size={16} /> Sửa</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {popupTxId && popupLoading && (
        <div className="popup-overlay"><div className="popup-content" style={{ padding: 40, textAlign: "center" }}><Loader2 size={24} style={{ animation: "spin 1s linear infinite", margin: "auto" }} /> Đang tải chi tiết...</div></div>
      )}

      <div style={{ marginTop: 16 }}>
        <MonthNavigator />
      </div>

      {viewMode === 'feed' ? (
        <div style={{ marginTop: 16 }}>
          {loading && items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
              Đang tải dữ liệu...
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
              <FilterX size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              Không có giao dịch khớp bộ lọc.
            </div>
          ) : (
            sortedDates.map((date) => (
              <div key={date} className="feed-group">
                <div className="feed-group-header">
                  <div className="feed-date">{getDayLabel(date)}</div>
                  <div className="feed-summary">{getDaySummary(groupedItems[date])}</div>
                </div>
                <div>
                  {groupedItems[date].map((t) => (
                    <div 
                      key={t.id} 
                      className="feed-item" 
                      style={{ cursor: "pointer", ...(t.status !== 'ok' ? { opacity: 0.7 } : {}) }}
                      onClick={() => handleRowClick(t)}
                    >
                      <div className={`feed-icon ${t.txType}`}>
                        {t.txType === 'thu' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      </div>
                      <div className="feed-content">
                        <div className="feed-title">{t.note || t.categoryName || "Giao dịch không tên"}</div>
                        <div className="feed-meta">
                          {t.customerName && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckSquare size={12} /> {t.customerName}
                            </span>
                          )}
                          {t.walletName && (
                            <span className="wallet-badge">
                              {getWalletIcon(t.walletName)}
                              {t.walletName}
                            </span>
                          )}
                          {t.categoryName && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Tag size={12} /> {t.categoryName}
                            </span>
                          )}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Hash size={12} /> {t.sourceSheet.length > 10 ? t.sourceSheet.substring(0, 10) + "..." : t.sourceSheet}
                          </span>
                        </div>
                      </div>
                      <div className="feed-right">
                        <div className={`tx-amount ${t.txType}`} style={{ fontSize: 17 }}>
                          {t.txType === 'thu' ? '+' : '-'}{formatMoney(t.amount)} ₫
                        </div>
                        <div className="feed-actions">
                          {t.note && (
                            <button className="feed-action-btn" title="Copy Ghi chú" onClick={(e) => { e.stopPropagation(); copyText(t.note!); }}>
                              <Copy size={14} />
                            </button>
                          )}
                          <button
                            className="feed-action-btn"
                            title="Sửa giao dịch"
                            onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="feed-action-btn"
                            title="Xoá giao dịch"
                            onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                            style={{ color: "#dc2626" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="card-container" style={{ marginTop: 16, padding: 0, overflowX: "auto" }}>
          <table className="tx-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>Ngày</th>
                <th style={{ textAlign: "center" }}>Loại</th>
                <th className="text-right">Số tiền</th>
                <th>Đối tượng</th>
                <th>Ví</th>
                <th>Danh mục</th>
                <th>Ghi chú</th>
                <th style={{ textAlign: "center" }}>Nguồn</th>
                <th style={{ textAlign: "center" }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{ textAlign: "center", padding: 40, color: "var(--muted-foreground)" }}
                  >
                    <FilterX size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    Không có giao dịch khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                items.map((t) => (
                  <tr 
                    key={t.id} 
                    className="tx-row" 
                    style={{ cursor: "pointer", ...(t.status !== 'ok' ? { backgroundColor: 'var(--muted)' } : {}) }}
                    onClick={() => handleRowClick(t)}
                  >
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
                        fontSize: 13,
                        fontWeight: 700,
                        backgroundColor: t.txType === "thu" ? '#dcfce7' : '#fee2e2',
                        color: t.txType === "thu" ? '#16a34a' : '#dc2626',
                      }}>
                        {t.txType === "thu" ? "Thu" : "Chi"}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={`tx-amount ${t.txType}`}>
                        {t.txType === "thu" ? "+" : "-"}{formatMoney(t.amount)} ₫
                      </span>
                    </td>
                    <td>{t.customerName || "—"}</td>
                    <td>
                      {t.walletName ? (
                        <span className="wallet-badge" style={{ padding: '4px 8px' }}>
                          {getWalletIcon(t.walletName)}
                          {t.walletName}
                        </span>
                      ) : "—"}
                    </td>
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
                          <button type="button" className="copy-btn" onClick={(e) => { e.stopPropagation(); copyText(t.note!); }} title="Copy">
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted-foreground)", fontWeight: 500, textAlign: "center" }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Hash size={12} />
                        <span title={t.sourceSheet}>{t.sourceSheet.length > 15 ? t.sourceSheet.substring(0, 15) + "..." : t.sourceSheet}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <div className="feed-actions" style={{ justifyContent: "center", opacity: 1 }}>
                        <button className="feed-action-btn" title="Sửa giao dịch" onClick={(e) => { e.stopPropagation(); handleEditClick(t); }}>
                          <Edit size={14} />
                        </button>
                        <button className="feed-action-btn" title="Sao chép giao dịch" onClick={(e) => { e.stopPropagation(); handleDuplicate(t); }}>
                          <Copy size={14} />
                        </button>
                        <button className="feed-action-btn" title="Xoá giao dịch" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} style={{ color: "#dc2626" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 16, padding: '12px 16px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted-foreground)' }}>
            <span>Hiển thị</span>
            <select 
              value={pageSize} 
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="tx-filter-input"
              style={{ padding: '4px 8px', borderRadius: 6 }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>dòng mỗi trang · Tổng <b>{total.toLocaleString("vi-VN")}</b> dòng</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button 
              type="button" 
              className="btn-ghost" 
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Trang trước
            </button>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Trang {page} / {Math.ceil(total / pageSize) || 1}</span>
            <button 
              type="button" 
              className="btn-ghost" 
              disabled={page >= Math.ceil(total / pageSize) || loading}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <MonthNavigator />
        </div>
      )}
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
    alignItems: "center"
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
