import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Sổ Thu Chi — Hệ Thống Nội Bộ</h1>
      <p>Nền tảng chạy ổn định. Sẵn sàng cho Giai đoạn 2 (Xác thực & Quản trị User).</p>
      <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px" }}>
        <strong>Trạng thái:</strong> Hệ thống Web đang hoạt động (Phase 1 Ready).
      </div>
      <nav style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
        <Link href="/login" style={{ padding: "0.5rem 1rem", backgroundColor: "#2563eb", color: "#fff", borderRadius: "4px", textDecoration: "none" }}>Đăng nhập</Link>
        <Link href="/dashboard" style={{ padding: "0.5rem 1rem", backgroundColor: "#10b981", color: "#fff", borderRadius: "4px", textDecoration: "none" }}>Báo cáo</Link>
      </nav>
    </main>
  );
}
