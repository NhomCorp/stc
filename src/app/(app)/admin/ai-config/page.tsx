"use client";

import React, { useEffect, useState, useRef } from "react";
import { Save, Plus, Trash2, Key, User, Bot, AlertCircle } from "lucide-react";

interface AIConfig {
  model: string;
  keys: string[];
  key_labels: string[];
  owner_names: string;
  prompt: string;
}

const MASKED_KEY_PLACEHOLDER = "••••••••••••••••••••••••••••••••";

export default function AIConfigPage() {
  const [config, setConfig] = useState<AIConfig>({
    model: "gemini-2.5-flash",
    keys: [""],
    key_labels: [""],
    owner_names: "",
    prompt: "",
  });

  const [initialConfig, setInitialConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Computed state để xác định nút lưu Model có cần sáng không
  const isModelChanged = initialConfig ? config.model !== initialConfig.model : false;

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/admin/ai-config");
      if (!res.ok) throw new Error("Lỗi mạng");
      const data = await res.json();
      if (data.config) {
        const fetchedConfig = {
          model: data.config.model || "gemini-2.5-flash",
          keys: data.config.keys?.length ? data.config.keys : [""],
          key_labels: data.config.key_labels?.length ? data.config.key_labels : [""],
          owner_names: data.config.owner_names || "",
          prompt: data.config.prompt || "",
        };
        setConfig(fetchedConfig);
        setInitialConfig(fetchedConfig);
      }
    } catch (err: any) {
      setMessage({ text: "Lỗi tải cấu hình AI: " + err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveConfigToServer(false);
  };

  const handleSaveModel = async () => {
    if (!isModelChanged) return;
    await saveConfigToServer(true);
  };

  const saveConfigToServer = async (isModelOnly: boolean) => {
    if (isModelOnly) setSavingModel(true);
    else setSaving(true);
    
    setMessage(null);

    const validKeys: string[] = [];
    const validLabels: string[] = [];
    config.keys.forEach((key, index) => {
      const trimmed = key.trim();
      if (trimmed) {
        // Nếu user để nguyên dạng masked (••••...), ta lấy lại giá trị gốc từ initialConfig nếu có
        let finalKey = trimmed;
        if (trimmed.includes("••••") && initialConfig && initialConfig.keys[index]) {
          finalKey = initialConfig.keys[index];
        }
        validKeys.push(finalKey);
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
        const savedConfig = {
          ...config,
          keys: validKeys.length ? validKeys : [""],
          key_labels: validLabels.length ? validLabels : [""],
        };
        setConfig(savedConfig);
        setInitialConfig(savedConfig); // Cập nhật lại initialConfig để reset trạng thái nút Lưu model
      } else {
        throw new Error(data.error || "Không thể lưu cấu hình");
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      if (isModelOnly) setSavingModel(false);
      else setSaving(false);
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
    
    // Nếu xóa key đã lưu, cũng cần loại bỏ nó khỏi initialConfig để tránh lệch index
    // Nhưng vì UI state đã tách rời khỏi DB tới khi save, cách tốt nhất là chỉ update `config`
    // Khi save, nó sẽ lấy các giá trị hiện tại.
    
    if (newKeys.length === 0) {
      newKeys.push("");
      newLabels.push("");
    }
    setConfig({ ...config, keys: newKeys, key_labels: newLabels });
  };

  // Helper để hiển thị key đã che 
  const displayKey = (key: string, index: number) => {
    if (!key) return "";
    
    // Nếu key đã bị sửa đổi và khác với initial (đang gõ mới) -> hiện nguyên bản
    if (initialConfig && initialConfig.keys[index] !== key) {
       return key;
    }
    
    // Nếu là key cũ từ DB, che ở giữa
    if (key.length > 8) {
      const first4 = key.substring(0, 4);
      const last4 = key.substring(key.length - 4);
      return `${first4}••••••••••••••••••••••••••••••••${last4}`;
    }
    
    return key;
  };

  const handleKeyFocus = (index: number) => {
    // Khi focus vào ô, nếu đang là dạng che, ta hiển thị dạng chuỗi rỗng để người dùng dễ nhập mới
    // (hoặc nếu muốn họ có thể xoá đi nhập lại)
    const currentKey = config.keys[index];
    if (initialConfig && currentKey === initialConfig.keys[index]) {
       // Optional: clear on focus or keep original. Here we keep it but it will show actual value
       // because we bind value={config.keys[index]} below instead of displayKey for focus state
       // Actually, to make it simple, we don't change state on focus, just bind input value to displayKey
       // and handle changes carefully.
    }
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

      <form onSubmit={handleSaveAll} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Model */}
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label style={{ ...styles.label, marginBottom: 0 }}>Mô hình AI Gemini</label>
            <button 
              type="button" 
              onClick={handleSaveModel}
              disabled={!isModelChanged || savingModel} 
              style={{
                ...styles.saveButton, 
                padding: "6px 12px", 
                fontSize: "12px",
                opacity: isModelChanged ? 1 : 0.5,
                cursor: isModelChanged ? "pointer" : "not-allowed"
              }}
            >
              <Save size={14} />
              {savingModel ? "Đang lưu..." : "Lưu Model"}
            </button>
          </div>
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
                  type="text" // Đổi từ password sang text để hiển thị chuỗi đã che
                  value={displayKey(key, i)}
                  onChange={(e) => updateKey(i, e.target.value)}
                  onFocus={() => handleKeyFocus(i)}
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
