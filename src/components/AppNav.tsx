"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  FolderTree,
  UploadCloud,
  ShieldAlert,
  LogOut,
  User,
  Sun,
  Moon,
  Wallet,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/transactions", label: "Giao dịch", icon: ArrowLeftRight },
  { href: "/master", label: "Danh mục", icon: FolderTree },
  { href: "/import", label: "Nhập liệu", icon: UploadCloud },
];

export function AppNav({
  userLabel,
  isAdmin,
}: {
  userLabel: string;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setTheme("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  };

  const allLinks = isAdmin
    ? [
        ...links,
        { href: "/admin/users", label: "Quản trị", icon: ShieldAlert },
      ]
    : links;

  const isActive = (href: string) =>
    href.startsWith("/admin")
      ? pathname.startsWith("/admin")
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-brand-container">
          <button
            type="button"
            className="app-hamburger"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
          <Link href="/dashboard" className="app-brand">
            <Wallet size={22} color="var(--primary)" />
            <span>Sổ Thu Chi</span>
          </Link>
        </div>

        <nav className={`app-nav-links ${isOpen ? "app-nav-open" : ""}`}>
          <div className="app-nav-menu">
            {allLinks.map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`app-nav-link ${isActive(l.href) ? "active" : ""}`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon size={16} />
                  <span>{l.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="app-nav-right">
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === "dark" ? "Chuyển giao diện sáng" : "Chuyển giao diện tối"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <span className="app-user" title={userLabel}>
              <User size={14} />
              <span>{userLabel}</span>
            </span>

            <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
              <button type="submit" className="app-logout">
                <LogOut size={14} />
                <span>Đăng xuất</span>
              </button>
            </form>
          </div>
        </nav>
      </div>
    </header>
  );
}
