"use client";

import React, { useEffect, useState } from "react";
import { Mail, Plus, Edit2, Trash2, FileDown, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function MailRulesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [pasteData, setPasteData] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mail-rules");
      const data = await res.json();
      if (res.ok) setItems(data.items);
    } catch (e) {
      toast.error("Lỗi tải quy tắc quét mail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/mail-rules", {
        method: editor.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      if (res.ok) {
        toast.success(editor.id ? "Đã cập nhật quy tắc" : "Đã thêm quy tắc");
        setEditor(null);
        loadData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Lỗi lưu quy tắc");
      }
    } catch (e) {
      toast.error("Lỗi hệ thống");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa quy tắc này?")) return;
    try {
      const res = await fetch(`/api/admin/mail-rules?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Đã xóa");
        loadData();
      }
    } catch (e) {}
  };

  const handleImport = async () => {
    if (!pasteData.trim()) return;
    
    const lines = pasteData.split("\n");
    const parsedItems = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = line.split("\t");
      if (cols.length < 1) continue;

      // Thứ tự: Keyword | Ví | Đối tượng | Danh mục con | Ghi chú
      parsedItems.push({
        keyword: cols[0]?.trim() || "",
        walletName: cols[1]?.trim() || null,
        customerName: cols[2]?.trim() || null,
        categoryName: cols[3]?.trim() || null,
        note: cols[4]?.trim() || null,
      });
    }

    if (parsedItems.length === 0) {
      toast.error("Không tìm thấy dữ liệu hợp lệ");
      return;
    }

    const toastId = toast.loading(`Đang import ${parsedItems.length} dòng...`);
    try {
      const res = await fetch("/api/admin/mail-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsedItems }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Đã tạo mới: ${data.created}, Cập nhật: ${data.updated}`, { id: toastId });
        setPasteData("");
        setImporting(false);
        loadData();
      } else {
        toast.error(data.error || "Lỗi import", { id: toastId });
      }
    } catch (e) {
      toast.error("Lỗi hệ thống khi import", { id: toastId });
    }
  };

  const handleCsv = async (commit = false) => {
    if (!csvFile) return;
    const toastId = toast.loading(commit ? "Đang ghi CSV vào giao dịch..." : "Đang đọc CSV...");
    try {
      const text = await csvFile.text();
      const res = await fetch("/api/admin/mail-rules/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fileName: csvFile.name, commit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi xử lý CSV");
      if (commit) {
        toast.success(`Đã ghi ${data.validRows} dòng, trùng ${data.duplicateRows}, lỗi ${data.errorRows}`, { id: toastId });
        setCsvPreview(null);
        setCsvFile(null);
      } else {
        setCsvPreview(data);
        toast.success(`Đọc ${data.totalRows} dòng, khớp ${data.matchedRows}, sẵn sàng ghi ${data.readyRows}`, { id: toastId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi CSV", { id: toastId });
    }
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ backgroundColor: "var(--muted)", padding: 12, borderRadius: 10 }}>
          <Mail size={24} color="var(--primary)" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>So khớp Quét Mail / Import CSV</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
            Bảng quy tắc dùng để nhận diện và gán thông tin giao dịch từ nguồn Mail, SMS hoặc CSV.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { setImporting(!importing); setCsvPreview(null); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "var(--muted)", color: "var(--foreground)", border: "1px solid var(--border)", cursor: "pointer" }}
          >
            <FileDown size={16} /> Import File CSV
          </button>
        </div>
        <button
          onClick={() => setEditor({ keyword: "", walletName: "", customerName: "", categoryName: "", note: "", isActive: true })}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "var(--primary)", color: "white", border: "none", cursor: "pointer" }}
        >
          <Plus size={16} /> Thêm Quy tắc
        </button>
      </div>

      {importing && (
        <div style={{ background: "var(--card)", padding: 16, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Nhập dữ liệu</h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Nhập từ CSV */}
            <div>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>1. So khớp & Ghi dữ liệu từ File CSV (Meta Ads, Ngân hàng)</h4>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted-foreground)" }}>Đọc file, tìm keyword, báo preview trước khi ghi thật.</p>
              <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} style={{ marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={!csvFile} onClick={() => handleCsv(false)} style={{ padding: "6px 16px", background: "var(--primary)", color: "white", border: "none", borderRadius: 6, cursor: csvFile ? "pointer" : "not-allowed" }}>Đọc file CSV (Preview)</button>
              </div>
            </div>

            {/* Paste cấu trúc cũ */}
            <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 20 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>2. Paste cấu trúc Bảng Quét Mail (Google Sheet) cũ</h4>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted-foreground)" }}>Chỉ dùng để mồi danh sách keyword. Keyword | Ghi chú | Ví | Đ.Tượng | Danh mục</p>
              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)", resize: "vertical", boxSizing: "border-box" }}
              />
              <button disabled={!pasteData.trim()} onClick={handleImport} style={{ marginTop: 8, padding: "6px 16px", background: "var(--foreground)", color: "var(--background)", border: "none", borderRadius: 6, cursor: pasteData.trim() ? "pointer" : "not-allowed" }}>Import Keyword</button>
            </div>
          </div>
        </div>
      )}

      {csvPreview && (
        <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Kết quả so khớp file CSV</span>
            <button onClick={() => handleCsv(true)} disabled={csvPreview.readyRows === 0} style={{ padding: "6px 16px", background: "var(--success)", color: "white", border: "none", borderRadius: 6, cursor: csvPreview.readyRows > 0 ? "pointer" : "not-allowed" }}>
              Ghi {csvPreview.readyRows} dòng hợp lệ
            </button>
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: 14 }}>
            Đọc {csvPreview.totalRows} dòng. Khớp keyword {csvPreview.matchedRows} dòng. Sẵn sàng ghi {csvPreview.readyRows} dòng.
          </p>
          <div style={{ overflowX: "auto", maxHeight: 400 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "var(--card)", textAlign: "left", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Dòng</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Trạng thái</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Keyword khớp</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Ngày</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Số tiền</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Ví</th>
                  <th style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>Ghi chú / Mô tả</th>
                </tr>
              </thead>
              <tbody>
                {csvPreview.rows.map((r: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: r.status === "OK" ? "rgba(34, 197, 94, 0.05)" : "transparent" }}>
                    <td style={{ padding: 8 }}>{r.row}</td>
                    <td style={{ padding: 8, fontWeight: 600, color: r.status === "OK" ? "var(--success)" : "var(--danger)" }}>{r.status}</td>
                    <td style={{ padding: 8 }}>{r.keyword || "-"}</td>
                    <td style={{ padding: 8 }}>{r.date || "-"}</td>
                    <td style={{ padding: 8 }}>{r.amount ? r.amount.toLocaleString() : "-"}</td>
                    <td style={{ padding: 8 }}>{r.walletName || "-"}</td>
                    <td style={{ padding: 8, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.note}>{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}><RefreshCw className="spin" /> Đang tải...</div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--muted)", textAlign: "left" }}>
              <tr>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)", minWidth: 200 }}>Keyword</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Ví</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Đối tượng</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Danh mục con</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Ghi chú</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)", width: 80 }}>Trạng thái</th>
                <th style={{ padding: 12, borderBottom: "1px solid var(--border)", width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 12 }}><b>{item.keyword}</b></td>
                  <td style={{ padding: 12 }}>{item.walletName || "—"}</td>
                  <td style={{ padding: 12 }}>{item.customerName || "—"}</td>
                  <td style={{ padding: 12 }}>{item.categoryName || "—"}</td>
                  <td style={{ padding: 12, color: "var(--muted-foreground)" }}>{item.note || "—"}</td>
                  <td style={{ padding: 12 }}>{item.isActive ? <span style={{ color: "var(--success)" }}>Bật</span> : <span style={{ color: "var(--danger)" }}>Tắt</span>}</td>
                  <td style={{ padding: 12, textAlign: "right" }}>
                    <button onClick={() => setEditor(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", marginRight: 8 }}><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)" }}>Chưa có quy tắc nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleSave} style={{ background: "var(--background)", padding: 24, borderRadius: 12, width: 450, maxWidth: "90%" }}>
            <h2 style={{ marginTop: 0 }}>{editor.id ? "Sửa Quy tắc" : "Thêm Quy tắc"}</h2>
            
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Keyword (Từ khóa nhận diện) *</div>
              <input required value={editor.keyword} onChange={e => setEditor({...editor, keyword: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", boxSizing: "border-box" }} placeholder="VD: VCB-MOBILE_BKKING" />
            </label>
            
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Ghi chú mặc định</div>
              <input value={editor.note || ""} onChange={e => setEditor({...editor, note: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", boxSizing: "border-box" }} placeholder="Ghi chú (tùy chọn)" />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "block" }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Ví</div>
                <input value={editor.walletName || ""} onChange={e => setEditor({...editor, walletName: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", boxSizing: "border-box" }} placeholder="Tên ví..." />
              </label>

              <label style={{ display: "block" }}>
                <div style={{ marginBottom: 4, fontWeight: 500 }}>Đối tượng</div>
                <input value={editor.customerName || ""} onChange={e => setEditor({...editor, customerName: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", boxSizing: "border-box" }} placeholder="Tên đối tượng..." />
              </label>
            </div>
            
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Danh mục con</div>
              <input value={editor.categoryName || ""} onChange={e => setEditor({...editor, categoryName: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", boxSizing: "border-box" }} placeholder="Tên danh mục..." />
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, cursor: "pointer" }}>
              <input type="checkbox" checked={editor.isActive} onChange={e => setEditor({...editor, isActive: e.target.checked})} />
              <span>Kích hoạt quy tắc này</span>
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={() => setEditor(null)} style={{ padding: "8px 16px", background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Hủy</button>
              <button type="submit" style={{ padding: "8px 16px", background: "var(--primary)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>Lưu</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
