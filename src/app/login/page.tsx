"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Đăng nhập thất bại");
        setLoading(false);
        return;
      }

      // Kiểm tra xem có bắt buộc đổi mật khẩu lần đầu hay không
      if (data.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại sau.");
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>💰</div>
          <h1 style={styles.title}>Sổ Thu Chi AI</h1>
          <p style={styles.subtitle}>Đăng nhập vào hệ thống nội bộ</p>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Tên đăng nhập</label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
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
            {loading ? "Đang xử lý..." : "Đăng nhập"}
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
    backgroundColor: "#f1f5f9",
    padding: "20px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "400px",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    padding: "32px 28px",
  },
  header: {
    textAlign: "center",
    marginBottom: "24px",
  },
  logoBadge: {
    fontSize: "36px",
    marginBottom: "8px",
  },
  title: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#0f172a",
    margin: "0 0 6px 0",
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
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
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
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
    transition: "background-color 0.2s",
  },
};
