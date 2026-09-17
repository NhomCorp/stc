"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Báo cáo" },
  { href: "/transactions", label: "Giao dịch" },
  { href: "/master", label: "Danh mục" },
  { href: "/import", label: "Import" },
];

export function AppNav({
  userLabel,
  isAdmin,
}: {
  userLabel: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();

  const allLinks = isAdmin
    ? [...links, { href: "/admin/users", label: "Admin" }]
    : links;

  const isActive = (href: string) =>
    href.startsWith("/admin")
      ? pathname.startsWith("/admin")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside style={styles.sidebar}>
      <Link href="/dashboard" style={styles.brand}>
        Sổ Thu Chi
      </Link>
      <nav style={styles.nav}>
        {allLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              ...styles.link,
              ...(isActive(l.href) ? styles.linkActive : null),
            }}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div style={styles.bottom}>
        <span style={styles.user}>{userLabel}</span>
        <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={styles.logout}>
            Đăng xuất
          </button>
        </form>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 220,
    flexShrink: 0,
    height: "100dvh",
    background: "#fff",
    borderRight: "1px solid #e2e8f0",
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    overflow: "auto",
  },
  brand: {
    fontWeight: 700,
    fontSize: 16,
    color: "#0f172a",
    textDecoration: "none",
    whiteSpace: "nowrap",
    display: "block",
    padding: "4px 8px",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  link: {
    display: "block",
    padding: "8px 10px",
    borderRadius: 6,
    color: "#475569",
    textDecoration: "none",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  linkActive: {
    background: "#e2e8f0",
    color: "#0f172a",
    fontWeight: 600,
  },
  bottom: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  user: {
    fontSize: 12,
    color: "#334155",
    background: "#f1f5f9",
    padding: "3px 10px",
    borderRadius: 999,
    maxWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logout: {
    padding: "8px 10px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
};