"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("Mật khẩu mới phải có tối thiểu 8 ký tự.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Đổi mật khẩu thất bại");
        setLoading(false);
        return;
      }

      setSuccess("Đổi mật khẩu thành công! Đang chuyển hướng vào hệ thống...");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1500);
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại sau.");
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.iconBadge}>🔐</div>
          <h1 style={styles.title}>Đổi mật khẩu lần đầu</h1>
          <p style={styles.subtitle}>
            Vì lý do bảo mật, bạn bắt buộc phải thay đổi mật khẩu tạm do Quản trị viên cấp trước khi tiếp tục.
          </p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Mật khẩu hiện tại (Mật khẩu tạm)</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Nhập mật khẩu tạm được cấp"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Mật khẩu mới (tối thiểu 8 ký tự)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nhập mật khẩu mới an toàn"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Xác nhận mật khẩu mới</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Đang xử lý..." : "Cập nhật mật khẩu & Tiếp tục"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    padding: "32px 28px",
  },
  header: {
    textAlign: "center",
    marginBottom: "24px",
  },
  iconBadge: {
    fontSize: "36px",
    marginBottom: "8px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#0f172a",
    margin: "0 0 8px 0",
  },
  subtitle: {
    fontSize: "13px",
    color: "#475569",
    lineHeight: "1.5",
    margin: 0,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "18px",
    border: "1px solid #fecaca",
  },
  successBox: {
    backgroundColor: "#f0fdf4",
    color: "#15803d",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "18px",
    border: "1px solid #bbf7d0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#334155",
  },
  input: {
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    marginTop: "8px",
    padding: "12px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
  },
};
