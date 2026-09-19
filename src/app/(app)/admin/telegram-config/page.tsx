"use client";

import React, { useEffect, useState } from "react";
import { Save, AlertCircle } from "lucide-react";

interface TelegramConfig {
  token: string;
  adminId: string;
  secret: string;
}

export default function TelegramConfigPage() {
  const [config, setConfig] = useState<TelegramConfig>({
    token: "",
    adminId: "",
    secret: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/admin/telegram-config");
      if (!res.ok) throw new Error("Lỗi mạng");
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err: any) {
      setMessage({ text: "Lỗi tải cấu hình Telegram: " + err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/telegram-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Không thể lưu cấu hình");
      setMessage({ text: "Lưu cấu hình Telegram thành công", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const generateSecret = () => {
    const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setConfig({ ...config, secret: randomSecret });
  };

  const setWebhook = async () => {
    setMessage(null);
    if (!config.token || !config.secret) {
      setMessage({ text: "Vui lòng nhập Token và tạo Secret trước khi cài Webhook", type: "error" });
      return;
    }
    try {
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/api/telegram/webhook?secret=${config.secret}`;
      const res = await fetch(`https://api.telegram.org/bot${config.token}/setWebhook?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.ok) {
        setMessage({ text: "Kích hoạt Webhook thành công!", type: "success" });
      } else {
        throw new Error(data.description || "Lỗi khi set Webhook");
      }
    } catch (err: any) {
      setMessage({ text: "Lỗi: " + err.message, type: "error" });
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Đang tải...</div>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>Cấu hình Telegram</h1>
      
      {message && (
        <div style={{
          padding: 12, marginBottom: 20, borderRadius: 6, display: "flex", gap: 10, alignItems: "center",
          backgroundColor: message.type === "success" ? "var(--success-bg, #ecfdf5)" : "var(--destructive-bg, #fef2f2)",
          color: message.type === "success" ? "var(--success, #059669)" : "var(--destructive, #dc2626)"
        }}>
          <AlertCircle size={20} />
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Bot Token</label>
          <input
            type="text"
            value={config.token}
            onChange={e => setConfig({...config, token: e.target.value})}
            placeholder="Ví dụ: 123456789:ABCdefGHIjklmNOPqrsTUVwxyz..."
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Admin Chat ID (Bảo vệ bot khỏi người lạ)</label>
          <input
            type="text"
            value={config.adminId}
            onChange={e => setConfig({...config, adminId: e.target.value})}
            placeholder="Ví dụ: 123456789 (ID cá nhân của bạn trên Telegram)"
            style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>Webhook Secret (Bảo vệ Webhook khỏi fake request)</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="text"
              value={config.secret}
              onChange={e => setConfig({...config, secret: e.target.value})}
              placeholder="Chuỗi ngẫu nhiên bảo mật..."
              style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--background)", color: "var(--foreground)" }}
            />
            <button type="button" onClick={generateSecret} style={{ padding: "8px 16px", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
              Tạo mới
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
              backgroundColor: "var(--primary)", color: "var(--primary-foreground)",
              border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            <Save size={18} /> {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
          
          <button
            type="button"
            onClick={setWebhook}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
              backgroundColor: "transparent", color: "var(--foreground)",
              border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer"
            }}
          >
            Kích hoạt Webhook ngay
          </button>
        </div>
      </form>
    </div>
  );
}
