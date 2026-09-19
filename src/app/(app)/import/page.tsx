"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Upload, FileDown, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

type ImportResult = {
  syncRunId: number;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  masters: {
    customersCreated: number;
    walletsCreated: number;
    categoriesCreated: number;
  };
  errors: Array<{ row: number; message: string }>;
};

export default function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      toast.error("Vui lòng nhập dữ liệu cần import");
      return;
    }
    
    setBusy(true);
    setResult(null);
    const loadingId = toast.loading("Đang import dữ liệu...");
    
    try {
      const res = await fetch("/api/import/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceSheet: "paste_manual" }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Import thất bại");
      
      setResult(data);
      setText("");
      toast.success(`Đã import thành công ${data.validRows} dòng`, { id: loadingId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi import", { id: loadingId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--foreground)" }}>Nhập liệu</h1>
      </div>
      
      <p style={{ color: "var(--muted-foreground)", fontSize: 15, fontWeight: 500, lineHeight: 1.6, margin: "0 0 20px" }}>
        Dán dữ liệu từ sheet Log (9 cột: Ngày, Thu/Chi, Số tiền, Ví, Đối tượng,
        Danh mục, Ghi chú, UNIQUE_KEY, Status). Danh mục dùng chung thu/chi;
        hệ thống tự tạo master còn thiếu và bỏ qua dòng trùng.
      </p>

      <div style={styles.hint}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Info size={20} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ display: 'block', marginBottom: 8 }}>Import hàng loạt từ Google Sheet:</strong>
            <pre style={styles.pre}>npm run db:import-log</pre>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              (dùng file <code>data/log_export.json</code> đã export — 869 dòng từ Log_05→09/2026)
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handlePaste} className="card-container" style={styles.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <FileDown size={18} color="var(--primary)" />
          <label style={{ fontWeight: 600, color: "var(--foreground)" }}>
            Paste từ Excel / Google Sheets
          </label>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={"01/09/2026\tChi\t50000\tCash\tBản thân\tCafe\t...\tTX_...\tOK"}
          style={styles.textarea}
          required
          disabled={busy}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary" style={{ marginTop: 16 }}>
          {busy ? (
            <>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
              <span>Đang xử lý...</span>
            </>
          ) : (
            <>
              <Upload size={18} />
              <span>Import vào DB</span>
            </>
          )}
        </button>
      </form>

      {result && (
        <div className="card-container" style={{ ...styles.card, marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {result.errorRows > 0 ? (
              <AlertCircle size={24} color="var(--danger)" />
            ) : (
              <CheckCircle2 size={24} color="var(--success)" />
            )}
            <h3 style={{ margin: 0, fontSize: 18 }}>Kết quả Import #{result.syncRunId}</h3>
          </div>
          
          <div style={styles.statsGrid}>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Tổng dòng</div>
              <div style={styles.statValue}>{result.totalRows}</div>
            </div>
            <div style={{ ...styles.statBox, borderColor: "var(--success)" }}>
              <div style={styles.statLabel}>Ghi mới</div>
              <div style={{ ...styles.statValue, color: "var(--success)" }}>{result.validRows}</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statLabel}>Trùng lặp (bỏ qua)</div>
              <div style={styles.statValue}>{result.duplicateRows}</div>
            </div>
            <div style={{ ...styles.statBox, borderColor: result.errorRows > 0 ? "var(--danger)" : "var(--border)" }}>
              <div style={styles.statLabel}>Lỗi</div>
              <div style={{ ...styles.statValue, color: result.errorRows > 0 ? "var(--danger)" : "inherit" }}>
                {result.errorRows}
              </div>
            </div>
          </div>
          
          {(result.masters.customersCreated > 0 || result.masters.walletsCreated > 0 || result.masters.categoriesCreated > 0) && (
            <div style={{ marginTop: 16, padding: "14px 18px", background: "var(--muted)", borderRadius: 8, fontSize: 15 }}>
              <strong>Tự động tạo danh mục mới: </strong>
              <span style={{ color: "var(--muted-foreground)" }}>
                {result.masters.customersCreated} đối tượng,{" "}
                {result.masters.walletsCreated} ví,{" "}
                {result.masters.categoriesCreated} danh mục
              </span>
            </div>
          )}

          {result.errors.length > 0 && (
            <details style={styles.details}>
              <summary style={styles.summary}>
                <span style={{ fontWeight: 600, color: "var(--danger)" }}>
                  Chi tiết lỗi ({result.errors.length} dòng)
                </span>
              </summary>
              <ul style={styles.errorList}>
                {result.errors.map((e, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>Dòng {e.row}:</strong> {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: 20,
    marginTop: 16,
  },
  hint: {
    background: "rgba(59, 130, 246, 0.1)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    fontSize: 14,
    color: "#1e3a8a",
  },
  pre: {
    background: "var(--foreground)",
    color: "var(--background)",
    padding: "8px 12px",
    borderRadius: 6,
    margin: "0",
    overflowX: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
  },
  textarea: {
    width: "100%",
    padding: 14,
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    resize: "vertical",
    boxSizing: "border-box",
    background: "var(--background)",
    color: "var(--foreground)",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 12,
    marginTop: 16,
  },
  statBox: {
    padding: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--background)",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "var(--muted-foreground)",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--foreground)",
  },
  details: {
    marginTop: 16,
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    background: "rgba(239, 68, 68, 0.05)",
    overflow: "hidden",
  },
  summary: {
    padding: "12px 16px",
    cursor: "pointer",
    userSelect: "none",
  },
  errorList: {
    margin: 0,
    padding: "0 16px 16px 36px",
    lineHeight: 1.6,
    fontSize: 14,
    color: "var(--foreground)",
  }
};
