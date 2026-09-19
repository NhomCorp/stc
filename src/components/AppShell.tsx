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
      <main className="app-main" style={styles.main}>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    height: "100dvh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--background)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    overflow: "auto",
    minHeight: 0,
  },
};
