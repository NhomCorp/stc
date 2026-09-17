"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./master.module.css";

type Kind = "categories" | "category_groups" | "customers" | "wallets";
type Item = { id: number; name: string; isActive: boolean; groupId?: number | null; sortOrder: number };
type Editor = { kind: Kind; id?: number; name: string; groupId: string };
const tabs: { kind: Kind; label: string }[] = [{ kind: "categories", label: "Danh mục" }, { kind: "customers", label: "Đối tượng" }, { kind: "wallets", label: "Ví" }];

async function api(method: string, body?: object, kind?: Kind) {
  const res = await fetch(`/api/master${kind ? `?kind=${kind}` : ""}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Không thể thực hiện. Vui lòng thử lại.");
  return data;
}

export default function MasterPage() {
  const [kind, setKind] = useState<Kind>("categories");
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Item[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const drag = useRef<{ kind: Kind; id: number } | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);

  async function load() {
    const token = ++generation.current;
    setLoading(true);
    try {
      const [data, parents] = await Promise.all([api("GET", undefined, kind), kind === "categories" ? api("GET", undefined, "category_groups") : Promise.resolve({ items: [] })]);
      if (token === generation.current) { setItems(data.items); setGroups(parents.items); }
    } catch (e) { if (token === generation.current) setMessage(e instanceof Error ? e.message : "Lỗi tải dữ liệu"); }
    finally { if (token === generation.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { generation.current++; }; }, [kind]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage("");
    try { await action(); setEditor(null); setMessage(success); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Không lưu được"); }
    finally { locked.current = false; setBusy(false); drag.current = null; }
  }

  function reorder(k: Kind, list: Item[], from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= list.length || busy) return;
    const ordered = [...list];
    ordered.splice(to, 0, ordered.splice(from, 1)[0]);
    void mutate(() => api("PUT", { kind: k, orderedIds: ordered.map(i => i.id) }), "Đã lưu thứ tự.");
  }

  function row(item: Item, k: Kind, siblings: Item[], index: number) {
    return <div key={`${k}-${item.id}`} className={styles.row} onDragOver={e => {
      if (drag.current?.kind === k && siblings.some(i => i.id === drag.current?.id)) e.preventDefault();
    }} onDrop={e => {
      e.preventDefault(); e.stopPropagation();
      if (drag.current?.kind === k) reorder(k, siblings, siblings.findIndex(i => i.id === drag.current?.id), index);
      drag.current = null;
    }}>
      <span className={styles.handle} draggable={!busy && !editor} title="Kéo để đổi thứ tự trong cùng nhóm" onDragStart={e => { drag.current = { kind: k, id: item.id }; e.dataTransfer.setData("text/plain", String(item.id)); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { drag.current = null; }}>⠿</span>
      <span className={styles.name}>{item.name}<small>{item.isActive ? "Đang sử dụng" : "Đã tắt"}</small></span>
      <div className={styles.actions}>
        <button disabled={busy || !!editor || index === 0} aria-label={`Đưa ${item.name} lên`} onClick={() => reorder(k, siblings, index, index - 1)}>↑</button>
        <button disabled={busy || !!editor || index === siblings.length - 1} aria-label={`Đưa ${item.name} xuống`} onClick={() => reorder(k, siblings, index, index + 1)}>↓</button>
        <button disabled={busy} onClick={() => setEditor({ kind: k, id: item.id, name: item.name, groupId: String(item.groupId ?? "") })}>Sửa</button>
        <button disabled={busy || !!editor} onClick={() => void mutate(() => api("PATCH", { kind: k, id: item.id, isActive: !item.isActive }), "Đã cập nhật trạng thái.")}>{item.isActive ? "Tắt" : "Bật"}</button>
      </div>
    </div>;
  }

  return <div className={styles.page}>
    <header className={styles.header}><div><h1>Quản lý danh mục</h1><p>Danh mục dùng chung cho thu và chi. Quản lý tên, nhóm cha và thứ tự hiển thị.</p></div></header>
    <nav className={styles.tabs} aria-label="Loại danh mục">{tabs.map(t => <button key={t.kind} disabled={busy || loading} aria-pressed={kind === t.kind} onClick={() => { setKind(t.kind); setEditor(null); setMessage(""); }}>{t.label}</button>)}</nav>
    <div className={styles.toolbar}><div><strong>{items.length} mục{kind === "categories" ? ` · ${groups.length} danh mục cha` : ""}</strong><p>Kéo biểu tượng ⠿ hoặc dùng ↑ ↓ để sắp xếp trong cùng nhóm. Thứ tự tự động lưu.</p></div><div className={styles.actions}>
      {kind === "categories" && <button disabled={busy || loading} onClick={() => setEditor({ kind: "category_groups", name: "", groupId: "" })}>+ Tạo danh mục cha</button>}
      <button className={styles.primary} disabled={busy || loading} onClick={() => setEditor({ kind, name: "", groupId: "" })}>+ Thêm {kind === "categories" ? "danh mục con" : kind === "wallets" ? "ví" : "đối tượng"}</button>
    </div></div>
    {message && <div className={styles.notice} role="status">{message}</div>}
    {editor && <form className={styles.editor} onSubmit={e => { e.preventDefault(); const draft = editor; void mutate(() => api(draft.id ? "PATCH" : "POST", { kind: draft.kind, id: draft.id, name: draft.name.trim(), ...(draft.kind === "categories" ? { groupId: draft.groupId ? Number(draft.groupId) : null } : {}) }), draft.id ? "Đã lưu thay đổi." : "Đã tạo mới."); }}>
      <h2>{editor.id ? "Chỉnh sửa" : "Tạo mới"} {editor.kind === "category_groups" ? "danh mục cha" : editor.kind === "categories" ? "danh mục con" : editor.kind === "wallets" ? "ví" : "đối tượng"}</h2>
      <label>Tên<input autoFocus required maxLength={255} value={editor.name} disabled={busy} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
      {editor.kind === "categories" && <label>Danh mục cha<select value={editor.groupId} disabled={busy} onChange={e => setEditor({ ...editor, groupId: e.target.value })}><option value="">Không có danh mục cha</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}{!g.isActive ? " (đã tắt)" : ""}</option>)}</select><small>Đổi lựa chọn này để chuyển danh mục sang nhóm khác.</small></label>}
      <div className={styles.actions}><button className={styles.primary} disabled={busy || !editor.name.trim()}>{busy ? "Đang lưu…" : "Lưu"}</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>Hủy</button></div>
    </form>}
    {loading ? <p role="status">Đang tải dữ liệu…</p> : kind === "categories" ? <div className={styles.tree}>{[...groups, { id: 0, name: "Chưa có danh mục cha", isActive: true, sortOrder: 0 }].map((g, index) => {
      const children = items.filter(i => (i.groupId ?? 0) === g.id);
      return <section className={styles.group} key={g.id}><div className={styles.groupHeader}>{g.id ? row(g, "category_groups", groups, index) : <h2>{g.name}</h2>}<button disabled={busy} onClick={() => setEditor({ kind: "categories", name: "", groupId: g.id ? String(g.id) : "" })}>+ Thêm con</button></div><div className={styles.children}>{children.length ? children.map((i, n) => row(i, "categories", children, n)) : <p className={styles.empty}>Chưa có danh mục con.</p>}</div></section>;
    })}</div> : <section className={styles.group}>{items.length ? items.map((i, n) => row(i, kind, items, n)) : <p className={styles.empty}>Chưa có dữ liệu. Thêm mục đầu tiên ở phía trên.</p>}</section>}
  </div>;
}
