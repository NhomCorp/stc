"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const allLinks = isAdmin
    ? [...links, { href: "/admin/users", label: "Admin" }]
    : links;

  const linkStyle = (active: boolean) => ({
    ...styles.link,
    ...(active ? styles.linkActive : null),
    ...styles.linkMobile,
  });

  const isActive = (href: string) =>
    href.startsWith("/admin")
      ? pathname.startsWith("/admin")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <button
          type="button"
          className="app-hamburger"
          style={styles.hamburger}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
          aria-expanded={mobileMenuOpen}
        >
          <span style={styles.hamburgerLine} />
          <span style={styles.hamburgerLine} />
          <span style={styles.hamburgerLine} />
        </button>
        <Link href="/dashboard" style={styles.brand}>
          Sổ Thu Chi
        </Link>
        <nav className={`app-nav-links ${mobileMenuOpen ? "app-nav-open" : ""}`} style={styles.nav}>
          {allLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="app-nav-link"
              style={linkStyle(isActive(l.href))}
              onClick={() => setMobileMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div style={styles.right}>
        <span style={styles.user}>{userLabel}</span>
        <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={styles.logout}>
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    flexShrink: 0,
    height: 48,
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    padding: "0 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
    overflow: "hidden",
  },
  hamburger: {
    display: "none",
    flexDirection: "column",
    justifyContent: "space-between",
    width: 24,
    height: 18,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  },
  hamburgerLine: {
    display: "block",
    width: "100%",
    height: 2,
    background: "#334155",
    borderRadius: 2,
    transition: "transform 0.2s, opacity 0.2s",
  },
  brand: {
    fontWeight: 700,
    fontSize: 15,
    color: "#0f172a",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  nav: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  navOpen: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    background: "#fff",
    borderBottom: "1px solid #e2e8f0",
    flexDirection: "column",
    padding: "12px 16px",
    gap: 4,
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    zIndex: 50,
  },
  link: {
    padding: "5px 10px",
    borderRadius: 6,
    color: "#475569",
    textDecoration: "none",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  linkMobile: {
    width: "100%",
    textAlign: "left",
    padding: "12px 16px",
    fontSize: 15,
    borderRadius: 8,
  },
  linkActive: { background: "#e2e8f0", color: "#0f172a", fontWeight: 600 },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  user: {
    fontSize: 12,
    color: "#334155",
    background: "#f1f5f9",
    padding: "3px 10px",
    borderRadius: 999,
    maxWidth: 140,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logout: {
    padding: "6px 12px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
};