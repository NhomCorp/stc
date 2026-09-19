"use client";

import React, { useEffect, useState } from "react";
import { Save, Plus, Trash2, Key, User, Bot, AlertCircle } from "lucide-react";

interface AIConfig {
  model: string;
  keys: string[];
  key_labels: string[];
  owner_names: string;
  prompt: string;
}

export default function AIConfigPage() {
  const [config, setConfig] = useState<AIConfig>({
    model: "gemini-2.5-flash",
    keys: [""],
    key_labels: [""],
    owner_names: "",
    prompt: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/admin/ai-config");
      if (!res.ok) throw new Error("Lỗi mạng");
      const data = await res.json();
      if (data.config) {
        setConfig({
          model: data.config.model || "gemini-2.5-flash",
          keys: data.config.keys?.length ? data.config.keys : [""],
          key_labels: data.config.key_labels?.length ? data.config.key_labels : [""],
          owner_names: data.config.owner_names || "",
          prompt: data.config.prompt || "",
        });
      }
    } catch (err: any) {
      setMessage({ text: "Lỗi tải cấu hình AI: " + err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const validKeys: string[] = [];
    const validLabels: string[] = [];
    config.keys.forEach((key, index) => {
      const trimmed = key.trim();
      if (trimmed) {
        validKeys.push(trimmed);
        validLabels.push(config.key_labels[index]?.trim() || "");
      }
    });

    const payload = {
      ...config,
      keys: validKeys,
      key_labels: validLabels,
    };

    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: "Lưu cấu hình AI thành công!", type: "success" });
        setConfig((prev) => ({
          ...prev,
          keys: validKeys.length ? validKeys : [""],
          key_labels: validLabels.length ? validLabels : [""],
        }));
      } else {
        throw new Error(data.error || "Không thể lưu cấu hình");
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const addKeyRow = () => {
    setConfig({
      ...config,
      keys: [...config.keys, ""],
      key_labels: [...config.key_labels, ""],
    });
  };

  const updateKey = (index: number, val: string) => {
    const newKeys = [...config.keys];
    newKeys[index] = val;
    setConfig({ ...config, keys: newKeys });
  };

  const updateLabel = (index: number, val: string) => {
    const newLabels = [...config.key_labels];
    newLabels[index] = val;
    setConfig({ ...config, key_labels: newLabels });
  };

  const removeKeyRow = (index: number) => {
    const newKeys = config.keys.filter((_, i) => i !== index);
    const newLabels = config.key_labels.filter((_, i) => i !== index);
    if (newKeys.length === 0) {
      newKeys.push("");
      newLabels.push("");
    }
    setConfig({ ...config, keys: newKeys, key_labels: newLabels });
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "var(--muted-foreground)" }}>
        Đang tải cấu hình AI...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.iconContainer}>
          <Bot size={24} color="var(--primary)" />
        </div>
        <div>
          <h1 style={styles.title}>Cấu hình AI (Gemini)</h1>
          <p style={styles.subtitle}>
            Thiết lập mô hình, danh sách API Keys, chủ tài khoản và prompt hệ thống (tương tự Google Apps Script).
          </p>
        </div>
      </div>

      {message && (
        <div
          style={{
            ...styles.alert,
            backgroundColor: message.type === "success" ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)",
            borderColor: message.type === "success" ? "var(--success)" : "var(--danger)",
            color: message.type === "success" ? "var(--success)" : "var(--danger)",
          }}
        >
          <AlertCircle size={18} />
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Model */}
        <div style={styles.card}>
          <label style={styles.label}>Mô hình AI Gemini</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            style={styles.input}
            placeholder="VD: gemini-2.5-flash"
            required
          />
          <span style={styles.hint}>Mặc định: gemini-2.5-flash. Có thể dùng các model khác của Google.</span>
        </div>

        {/* API Keys */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Key size={18} color="var(--primary)" />
              <label style={styles.label}>Danh sách API Keys</label>
            </div>
            <button type="button" onClick={addKeyRow} style={styles.addButton}>
              <Plus size={14} /> Thêm Key
            </button>
          </div>
          <p style={styles.hint}>
            Thêm nhiều API Key để hệ thống tự động xoay vòng ngẫu nhiên, giảm thiểu giới hạn tốc độ (Rate Limit).
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {config.keys.map((key, i) => (
              <div key={i} style={styles.keyRow}>
                <input
                  type="text"
                  value={config.key_labels[i] || ""}
                  onChange={(e) => updateLabel(i, e.target.value)}
                  placeholder="Nhãn (VD: Key 1)"
                  style={{ ...styles.input, width: "30%" }}
                />
                <input
                  type="password"
                  value={key}
                  onChange={(e) => updateKey(i, e.target.value)}
                  placeholder="Điền API Key (AIzaSy...)"
                  style={{ ...styles.input, flex: 1, fontFamily: "monospace" }}
                />
                <button
                  type="button"
                  onClick={() => removeKeyRow(i)}
                  style={styles.deleteButton}
                  title="Xoá Key"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2 Cột: Chủ tài khoản & Prompt */}
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <User size={18} color="var(--primary)" />
              <label style={styles.label}>Chủ tài khoản (Người dùng)</label>
            </div>
            <p style={styles.hint}>Mỗi dòng một tên. Dùng để AI suy luận đối tượng Thu/Chi khi đọc hóa đơn.</p>
            <textarea
              value={config.owner_names}
              onChange={(e) => setConfig({ ...config, owner_names: e.target.value })}
              style={styles.textarea}
              placeholder={"Hieu\nTrung Hieu\nNguyen Trung Hieu"}
            />
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <Bot size={18} color="var(--primary)" />
              <label style={styles.label}>Prompt quy tắc cá nhân</label>
            </div>
            <p style={styles.hint}>Quy tắc phân loại, gán ví, alias riêng cho hệ thống AI áp dụng khi xử lý.</p>
            <textarea
              value={config.prompt}
              onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
              style={styles.textarea}
              placeholder={"- Không rõ nguồn → Bank\n- MN = Minh Nghĩa\n- Quy tắc Thu/Chi..."}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
          <button type="submit" disabled={saving} style={styles.saveButton}>
            <Save size={18} />
            {saving ? "Đang lưu..." : "Lưu cấu hình AI"}
          </button>
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "16px",
  },
  iconContainer: {
    backgroundColor: "var(--muted)",
    padding: "12px",
    borderRadius: "10px",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    margin: 0,
    color: "var(--foreground)",
  },
  subtitle: {
    fontSize: "13px",
    color: "var(--muted-foreground)",
    margin: "4px 0 0 0",
  },
  card: {
    backgroundColor: "var(--card)",
    border: "1px solid var(--card-border)",
    borderRadius: "10px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--foreground)",
  },
  hint: {
    fontSize: "12px",
    color: "var(--muted-foreground)",
    lineHeight: "1.4",
  },
  input: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "14px",
  },
  textarea: {
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "13px",
    minHeight: "140px",
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: "1.5",
  },
  keyRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  addButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px 12px",
    borderRadius: "6px",
    backgroundColor: "var(--muted)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 600,
  },
  deleteButton: {
    padding: "10px",
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--border)",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "20px",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 24px",
    borderRadius: "8px",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "none",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  alert: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "13px",
  },
};
