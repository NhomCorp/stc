import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";

export function AppShell({
  userLabel,
  isAdmin,
  children,
}: {
  userLabel: string;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={styles.shell}>
      <AppNav userLabel={userLabel} isAdmin={isAdmin} />
      <main className="app-main" style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f1f5f9",
    fontFamily: "system-ui, -apple-system, sans-serif",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    overflow: "auto",
    padding: "16px 20px",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
};