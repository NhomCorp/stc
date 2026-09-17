"use client";

import React, { useState } from "react";

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
  const [error, setError] = useState("");

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Import Log</h1>
      <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5, margin: "4px 0 0" }}>
        Dán dữ liệu từ sheet Log (9 cột: Ngày, Thu/Chi, Số tiền, Ví, Đối tượng,
        Danh mục, Ghi chú, UNIQUE_KEY, Status). Danh mục dùng chung thu/chi;
        hệ thống tự tạo master còn thiếu và bỏ qua dòng trùng.
      </p>

      <div style={styles.hint}>
        <strong>Import hàng loạt từ Google Sheet:</strong>
        <pre style={styles.pre}>npm run db:import-log</pre>
        (dùng file <code>data/log_export.json</code> đã export — 869 dòng từ
        Log_05→09/2026)
      </div>

      <form onSubmit={handlePaste} style={styles.card}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
          Paste từ Excel / Google Sheets
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={"01/09/2026\tChi\t50000\tCash\tBản thân\tCafe\t...\tTX_...\tOK"}
          style={styles.textarea}
          required
        />
        <button type="submit" disabled={busy} style={styles.primary}>
          {busy ? "Đang import..." : "Import vào DB"}
        </button>
      </form>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {result && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>Kết quả #{result.syncRunId}</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Tổng dòng: {result.totalRows}</li>
            <li>Ghi mới: {result.validRows}</li>
            <li>Trùng (bỏ qua): {result.duplicateRows}</li>
            <li>Lỗi: {result.errorRows}</li>
            <li>
              Master mới: {result.masters.customersCreated} đối tượng,{" "}
              {result.masters.walletsCreated} ví,{" "}
              {result.masters.categoriesCreated} danh mục
            </li>
          </ul>
          {result.errors.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary>Chi tiết lỗi ({result.errors.length})</summary>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Dòng {e.row}: {e.message}
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
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  hint: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    fontSize: 14,
    color: "#1e3a8a",
  },
  pre: {
    background: "#1e293b",
    color: "#e2e8f0",
    padding: "8px 12px",
    borderRadius: 6,
    margin: "8px 0 0",
    overflowX: "auto",
  },
  textarea: {
    width: "100%",
    padding: 12,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    fontFamily: "ui-monospace, monospace",
    fontSize: 13,
    resize: "vertical",
    boxSizing: "border-box",
  },
  primary: {
    marginTop: 12,
    padding: "10px 16px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontWeight: 600,
    cursor: "pointer",
  },
};
