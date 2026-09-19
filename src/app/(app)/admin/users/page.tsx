import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { Shield, KeyRound, UserCheck, Lock } from "lucide-react";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/login");
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.iconWrapper}>
            <Shield size={24} color="var(--primary)" />
          </div>
          <div>
            <h1 style={styles.pageTitle}>Quản trị tài khoản</h1>
            <p style={styles.subTitle}>
              Hệ thống vận hành chế độ 1 người dùng duy nhất (Single User) để bảo vệ dữ liệu riêng tư.
            </p>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserCheck size={18} color="var(--primary)" />
            <h2 style={styles.cardTitle}>Thông tin tài khoản quản trị</h2>
          </div>
          <span style={styles.badgeActive}>Đang hoạt động</span>
        </div>

        <div style={styles.grid}>
          <div style={styles.fieldItem}>
            <span style={styles.fieldLabel}>Tên đăng nhập</span>
            <span style={styles.fieldValue}>{user.username}</span>
          </div>

          <div style={styles.fieldItem}>
            <span style={styles.fieldLabel}>Họ và tên</span>
            <span style={styles.fieldValue}>{user.fullName || "Chưa đặt"}</span>
          </div>

          <div style={styles.fieldItem}>
            <span style={styles.fieldLabel}>Email</span>
            <span style={styles.fieldValue}>{user.email || "Chưa đặt"}</span>
          </div>

          <div style={styles.fieldItem}>
            <span style={styles.fieldLabel}>Vai trò</span>
            <span style={styles.fieldValue}>Chủ sở hữu hệ thống (Admin)</span>
          </div>
        </div>

        <div style={styles.divider} />

        <div style={styles.actionRow}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 }}>
              <Lock size={16} color="var(--muted-foreground)" />
              Bảo mật & Đăng nhập
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
              Nên đổi mật khẩu định kỳ để đảm bảo chỉ có bạn truy cập được vào sổ thu chi.
            </p>
          </div>
          <Link href="/change-password" style={styles.changePasswordBtn}>
            <KeyRound size={16} />
            Đổi mật khẩu
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 800,
    margin: "0 auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
    paddingBottom: 16,
  },
  iconWrapper: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "var(--muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--foreground)",
    margin: 0,
  },
  subTitle: {
    fontSize: 13,
    color: "var(--muted-foreground)",
    margin: "4px 0 0 0",
  },
  card: {
    backgroundColor: "var(--card)",
    border: "1px solid var(--card-border)",
    borderRadius: 12,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "var(--foreground)",
    margin: 0,
  },
  badgeActive: {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: "rgba(22, 163, 74, 0.15)",
    color: "var(--success)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  fieldItem: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "var(--background)",
    border: "1px solid var(--border)",
  },
  fieldLabel: {
    fontSize: 12,
    color: "var(--muted-foreground)",
    fontWeight: 500,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--foreground)",
  },
  divider: {
    height: 1,
    backgroundColor: "var(--border)",
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
  },
  changePasswordBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 20px",
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 600,
  },
};
