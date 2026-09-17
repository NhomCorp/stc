import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <AppShell
      userLabel={user.fullName || user.username}
      isAdmin={user.role === "admin"}
    >
      {children}
    </AppShell>
  );
}
