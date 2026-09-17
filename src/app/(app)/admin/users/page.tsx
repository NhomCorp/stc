import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    redirect("/login");
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={styles.headerRow}>
        <h1 style={styles.pageTitle}>Danh sách người dùng nội bộ</h1>
        <Link href="/admin/users/create" style={styles.createBtn}>
          + Tạo tài khoản mới
        </Link>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              <th style={styles.th}>Tên đăng nhập</th>
              <th style={styles.th}>Họ và tên</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Vai trò</th>
              <th style={styles.th}>Trạng thái</th>
              <th style={styles.th}>Phải đổi MK</th>
              <th style={styles.th}>Ngày tạo</th>
              <th style={styles.th}>Thao tác</th>
            </tr>
          </thead>
          <tbody style={styles.tbody}>
            <tr>
              <td colSpan={8} style={styles.empty}>
                Đang tải danh sách người dùng...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
    flexWrap: "wrap",
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
  },
  createBtn: {
    padding: "8px 16px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    borderRadius: 6,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
  },
  tableContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid #e2e8f0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  thead: {
    backgroundColor: "#f8fafc",
    borderBottom: "2px solid #e2e8f0",
  },
  th: {
    padding: "12px 14px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  tbody: {
    fontSize: 14,
  },
  empty: {
    padding: "40px 20px",
    textAlign: "center",
    color: "#64748b",
    fontSize: 14,
  },
};
