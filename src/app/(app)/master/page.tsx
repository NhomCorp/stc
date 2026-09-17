"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { 
  FolderTree, 
  Users, 
  Wallet, 
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Edit2, 
  Power, 
  PowerOff,
  GripVertical,
  Loader2
} from "lucide-react";
import styles from "./master.module.css";

type Kind = "categories" | "category_groups" | "customers" | "wallets";
type Item = { id: number; name: string; isActive: boolean; groupId?: number | null; sortOrder: number };
type Editor = { kind: Kind; id?: number; name: string; groupId: string };

const tabs: { kind: Kind; label: string; icon: any }[] = [
  { kind: "categories", label: "Danh mục", icon: FolderTree },
  { kind: "customers", label: "Đối tượng", icon: Users },
  { kind: "wallets", label: "Ví", icon: Wallet }
];

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
  const drag = useRef<{ kind: Kind; id: number } | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);

  async function load() {
    const token = ++generation.current;
    setLoading(true);
    try {
      const [data, parents] = await Promise.all([api("GET", undefined, kind), kind === "categories" ? api("GET", undefined, "category_groups") : Promise.resolve({ items: [] })]);
      if (token === generation.current) { setItems(data.items); setGroups(parents.items); }
    } catch (e) { 
      if (token === generation.current) toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu"); 
    }
    finally { if (token === generation.current) setLoading(false); }
  }
  
  useEffect(() => { void load(); return () => { generation.current++; }; }, [kind]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const toastId = toast.loading("Đang xử lý...");
    
    try { 
      await action(); 
      setEditor(null); 
      toast.success(success, { id: toastId }); 
      await load(); 
    }
    catch (e) { 
      toast.error(e instanceof Error ? e.message : "Không lưu được", { id: toastId }); 
    }
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
      <span className={styles.handle} draggable={!busy && !editor} title="Kéo để đổi thứ tự trong cùng nhóm" onDragStart={e => { drag.current = { kind: k, id: item.id }; e.dataTransfer.setData("text/plain", String(item.id)); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { drag.current = null; }}>
        <GripVertical size={16} />
      </span>
      <span className={styles.name}>
        {item.name}
        <small style={!item.isActive ? { background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' } : {}}>
          {item.isActive ? "Đang sử dụng" : "Đã tắt"}
        </small>
      </span>
      <div className={styles.actions}>
        <button disabled={busy || !!editor || index === 0} aria-label={`Đưa ${item.name} lên`} onClick={() => reorder(k, siblings, index, index - 1)} title="Lên trên">
          <ArrowUp size={14} />
        </button>
        <button disabled={busy || !!editor || index === siblings.length - 1} aria-label={`Đưa ${item.name} xuống`} onClick={() => reorder(k, siblings, index, index + 1)} title="Xuống dưới">
          <ArrowDown size={14} />
        </button>
        <button disabled={busy} onClick={() => setEditor({ kind: k, id: item.id, name: item.name, groupId: String(item.groupId ?? "") })} title="Chỉnh sửa">
          <Edit2 size={14} />
          <span className="hidden-mobile">Sửa</span>
        </button>
        <button 
          disabled={busy || !!editor} 
          onClick={() => void mutate(() => api("PATCH", { kind: k, id: item.id, isActive: !item.isActive }), "Đã cập nhật trạng thái.")}
          title={item.isActive ? "Tắt" : "Bật"}
          style={!item.isActive ? { color: 'var(--success)', borderColor: 'var(--success)' } : {}}
        >
          {item.isActive ? <PowerOff size={14} /> : <Power size={14} />}
          <span className="hidden-mobile">{item.isActive ? "Tắt" : "Bật"}</span>
        </button>
      </div>
    </div>;
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div>
        <h1>Quản lý danh mục</h1>
        <p>Quản lý tên, nhóm cha, thứ tự hiển thị và trạng thái của các đối tượng dùng chung.</p>
      </div>
    </header>
    
    <nav className={styles.tabs} aria-label="Loại danh mục">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button 
            key={t.kind} 
            disabled={busy || loading} 
            aria-pressed={kind === t.kind} 
            onClick={() => { setKind(t.kind); setEditor(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon size={16} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
    
    <div className={styles.toolbar}>
      <div>
        <strong>{items.length} mục{kind === "categories" ? ` · ${groups.length} danh mục cha` : ""}</strong>
        <p>Kéo biểu tượng <GripVertical size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> hoặc dùng ↑ ↓ để sắp xếp trong cùng nhóm. Thứ tự tự động lưu.</p>
      </div>
      <div className={styles.actions}>
        {kind === "categories" && (
          <button disabled={busy || loading} onClick={() => setEditor({ kind: "category_groups", name: "", groupId: "" })}>
            <Plus size={14} />
            <span>Tạo danh mục cha</span>
          </button>
        )}
        <button className={styles.primary} disabled={busy || loading} onClick={() => setEditor({ kind, name: "", groupId: "" })}>
          <Plus size={14} />
          <span>Thêm {kind === "categories" ? "danh mục con" : kind === "wallets" ? "ví" : "đối tượng"}</span>
        </button>
      </div>
    </div>
    
    {editor && <form className={styles.editor} onSubmit={e => { e.preventDefault(); const draft = editor; void mutate(() => api(draft.id ? "PATCH" : "POST", { kind: draft.kind, id: draft.id, name: draft.name.trim(), ...(draft.kind === "categories" ? { groupId: draft.groupId ? Number(draft.groupId) : null } : {}) }), draft.id ? "Đã lưu thay đổi." : "Đã tạo mới."); }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Edit2 size={18} color="var(--primary)" />
        <span>{editor.id ? "Chỉnh sửa" : "Tạo mới"} {editor.kind === "category_groups" ? "danh mục cha" : editor.kind === "categories" ? "danh mục con" : editor.kind === "wallets" ? "ví" : "đối tượng"}</span>
      </h2>
      <label>
        Tên
        <input autoFocus required maxLength={255} value={editor.name} disabled={busy} onChange={e => setEditor({ ...editor, name: e.target.value })} placeholder="Nhập tên..." />
      </label>
      {editor.kind === "categories" && (
        <label>
          Danh mục cha
          <select value={editor.groupId} disabled={busy} onChange={e => setEditor({ ...editor, groupId: e.target.value })}>
            <option value="">Không có danh mục cha</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}{!g.isActive ? " (đã tắt)" : ""}</option>)}
          </select>
          <small>Đổi lựa chọn này để chuyển danh mục sang nhóm khác.</small>
        </label>
      )}
      <div className={styles.actions} style={{ marginTop: 8 }}>
        <button className={styles.primary} disabled={busy || !editor.name.trim()}>
          {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Edit2 size={16} />}
          <span>{busy ? "Đang lưu…" : "Lưu"}</span>
        </button>
        <button type="button" disabled={busy} onClick={() => setEditor(null)}>Hủy</button>
      </div>
    </form>}
    
    {loading ? (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        Đang tải dữ liệu…
      </div>
    ) : kind === "categories" ? (
      <div className={styles.tree}>
        {[...groups, { id: 0, name: "Chưa có danh mục cha", isActive: true, sortOrder: 0 }].map((g, index) => {
          const children = items.filter(i => (i.groupId ?? 0) === g.id);
          return (
            <section className={styles.group} key={g.id}>
              <div className={styles.groupHeader}>
                {g.id ? row(g, "category_groups", groups, index) : <h2>{g.name}</h2>}
                <button disabled={busy} onClick={() => setEditor({ kind: "categories", name: "", groupId: g.id ? String(g.id) : "" })}>
                  <Plus size={14} /> Thêm con
                </button>
              </div>
              <div className={styles.children}>
                {children.length ? children.map((i, n) => row(i, "categories", children, n)) : <p className={styles.empty}>Chưa có danh mục con.</p>}
              </div>
            </section>
          );
        })}
      </div>
    ) : (
      <section className={styles.group}>
        {items.length ? items.map((i, n) => row(i, kind, items, n)) : <p className={styles.empty}>Chưa có dữ liệu. Thêm mục đầu tiên ở phía trên.</p>}
      </section>
    )}
  </div>;
}
