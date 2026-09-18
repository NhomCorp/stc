import React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default async function SharePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const error = params.error;
  const name = params.name;
  const size = params.size;
  const text = params.text;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>Kết quả Share từ Điện thoại</h1>

      {error ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--destructive)" }}>
          <AlertCircle />
          <span>Lỗi nhận ảnh: {error}</span>
        </div>
      ) : (
        <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--success)", marginBottom: 16 }}>
            <CheckCircle2 />
            <h2 style={{ fontSize: 18, margin: 0 }}>Nhận ảnh thành công!</h2>
          </div>
          <p><strong>Tên file:</strong> {name}</p>
          <p><strong>Kích thước:</strong> {size ? Math.round(Number(size) / 1024) + " KB" : "Unknown"}</p>
          {text && <p><strong>Đoạn text kèm theo:</strong> {text}</p>}

          <div style={{ marginTop: 20, padding: 12, background: "rgba(0,0,0,0.05)", borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--muted-foreground)" }}>
              * Đây là trang Test. Sau này, ảnh sẽ được tự động đẩy sang Gemini AI để trích xuất số tiền, ngày tháng và tự động điền vào Form Thêm Giao Dịch bên dưới.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}