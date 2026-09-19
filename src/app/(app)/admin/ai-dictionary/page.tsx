"use client";

import React, { useEffect, useState } from "react";
import { BookA, GraduationCap, Plus, Edit2, Trash2, Save, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AIDictionaryPage() {
  const [activeTab, setActiveTab] = useState<"alias" | "lesson">("alias");

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{ backgroundColor: "var(--muted)", padding: 12, borderRadius: 10 }}>
          <BookA size={24} color="var(--primary)" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Từ điển & Bài học AI</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
            Quản lý từ khóa (Alias) và bài học (AI Learning) để giúp Gemini nhận diện chính xác hơn.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("alias")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "alias" ? "2px solid var(--primary)" : "2px solid transparent",
            color: activeTab === "alias" ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: activeTab === "alias" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <BookA size={16} /> Alias (Tên gọi khác)
        </button>
        <button
          onClick={() => setActiveTab("lesson")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "lesson" ? "2px solid var(--primary)" : "2px solid transparent",
            color: activeTab === "lesson" ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: activeTab === "lesson" ? 600 : 400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <GraduationCap size={16} /> Lịch sử AI học
        </button>
      </div>

      {activeTab === "alias" ? <AliasManager /> : <LessonManager />}
    </div>
  );
}

function AliasManager() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/aliases");
      const data = await res.json();
      if (res.ok) setItems(data.items);
    } catch (e) {
      toast.error("Lỗi tải Alias");
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
      const res = await fetch("/api/admin/aliases", {
        method: editor.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      if (res.ok) {
        toast.success(editor.id ? "Đã cập nhật Alias" : "Đã thêm Alias");
        setEditor(null);
        loadData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Lỗi lưu Alias");
      }
    } catch (e) {
      toast.error("Lỗi hệ thống");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa Alias này?")) return;
    try {
      const res = await fetch(`/api/admin/aliases?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Đã xóa");
        loadData();
      }
    } catch (e) {}
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14 }}>
          Khi tin nhắn chứa <b>Từ khóa</b>, hệ thống sẽ gợi ý AI chuyển thành <b>Giá trị đích</b>.
        </p>
        <button
          onClick={() => setEditor({ keyword: "", type: "wallet", targetName: "", isActive: true })}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: "var(--primary)", color: "white", border: "none", cursor: "pointer" }}
        >
          <Plus size={16} /> Thêm Alias
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}><RefreshCw className="spin" /> Đang tải...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--card)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
          <thead style={{ background: "var(--muted)", textAlign: "left" }}>
            <tr>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Từ khóa (Keyword)</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Loại</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Giá trị đích (Target)</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Trạng thái</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)", width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: 12 }}><b>{item.keyword}</b></td>
                <td style={{ padding: 12 }}>
                  {item.type === "wallet" ? "Ví" : item.type === "customer" ? "Đối tượng" : "Danh mục"}
                </td>
                <td style={{ padding: 12 }}>{item.targetName}</td>
                <td style={{ padding: 12 }}>{item.isActive ? "Bật" : "Tắt"}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  <button onClick={() => setEditor(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", marginRight: 8 }}><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)" }}>Chưa có alias nào.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {editor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleSave} style={{ background: "var(--background)", padding: 24, borderRadius: 12, width: 400 }}>
            <h2 style={{ marginTop: 0 }}>{editor.id ? "Sửa Alias" : "Thêm Alias"}</h2>
            
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 4 }}>Từ khóa</div>
              <input required value={editor.keyword} onChange={e => setEditor({...editor, keyword: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }} />
            </label>
            
            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 4 }}>Loại</div>
              <select value={editor.type} onChange={e => setEditor({...editor, type: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--background)" }}>
                <option value="wallet">Ví</option>
                <option value="customer">Đối tượng</option>
                <option value="category">Danh mục con</option>
              </select>
            </label>
            
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ marginBottom: 4 }}>Giá trị đích (Tên chuẩn)</div>
              <input required value={editor.targetName} onChange={e => setEditor({...editor, targetName: e.target.value})} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)" }} />
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

function LessonManager() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-lessons");
      const data = await res.json();
      if (res.ok) setItems(data.items);
    } catch (e) {
      toast.error("Lỗi tải bài học");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Xóa bài học này?")) return;
    try {
      const res = await fetch(`/api/admin/ai-lessons?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Đã xóa");
        loadData();
      }
    } catch (e) {}
  };

  return (
    <div>
      <p style={{ margin: "0 0 16px", color: "var(--muted-foreground)", fontSize: 14 }}>
        Đây là các bài học hệ thống tự động ghi lại khi người dùng <b>sửa đổi</b> kết quả AI đoán sai. AI sẽ đọc 50 bài học gần nhất để cải thiện.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}><RefreshCw className="spin" /> Đang tải...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "var(--card)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
          <thead style={{ background: "var(--muted)", textAlign: "left" }}>
            <tr>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Nội dung gốc</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Trường bị sai</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>AI đoán sai</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Người dùng sửa thành</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>Số lần lặp</th>
              <th style={{ padding: 12, borderBottom: "1px solid var(--border)", width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: 12, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={item.sourceText}>{item.sourceText}</td>
                <td style={{ padding: 12 }}>{item.field === "vi" ? "Ví" : item.field === "doi_tuong" ? "Đối tượng" : "Danh mục"}</td>
                <td style={{ padding: 12, color: "var(--danger)" }}><del>{item.aiGuess}</del></td>
                <td style={{ padding: 12, color: "var(--success)", fontWeight: "bold" }}>{item.userFix}</td>
                <td style={{ padding: 12 }}>{item.count}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  <button onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--muted-foreground)" }}>Chưa có bài học nào.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
