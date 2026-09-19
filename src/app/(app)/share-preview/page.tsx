"use client";

import React, { useEffect, useState, use } from "react";
import { CheckCircle2, AlertCircle, Save, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SharePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = use(searchParams);
  const router = useRouter();
  const [txList, setTxList] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const error = params.error;

  useEffect(() => {
    if (params.data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(params.data));
        setTxList(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (e) {
        console.error("Lỗi parse dữ liệu share:", e);
      }
    }
  }, [params.data]);

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Lưu từng giao dịch vào API
      for (const item of txList) {
        const type = (item.phan_loai || "").toLowerCase().includes("thu") ? "thu" : "chi";
        const amount = Number(item.so_tien) || 0;
        
        let txDate = new Date();
        if (item.ngay_gd && item.ngay_gd.includes("/")) {
          const parts = item.ngay_gd.split("/");
          if (parts.length === 3) {
            txDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          }
        }

        await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txDate: txDate.toISOString(),
            txType: type,
            amount: amount,
            note: item.ghi_chu || "",
            status: "valid",
          }),
        });
      }

      toast.success("Đã lưu các giao dịch thành công!");
      router.push("/transactions");
    } catch (e: any) {
      toast.error("Lỗi lưu giao dịch: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 650, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 20 }}>Trích xuất Hóa đơn (PWA)</h1>

      {error ? (
        <div style={{ padding: 16, border: "1px solid var(--destructive)", borderRadius: 8, background: "rgba(239, 68, 68, 0.1)", color: "var(--destructive)", display: "flex", gap: 10, alignItems: "center" }}>
          <AlertCircle />
          <span>Lỗi nhận diện ảnh: {error}</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--success)", marginBottom: 12 }}>
              <CheckCircle2 />
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Gemini đã phân tích xong {txList.length} giao dịch</h2>
            </div>

            {txList.map((tx, idx) => (
              <div key={idx} style={{ padding: 12, background: "var(--background)", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                  <span>{tx.phan_loai || "Giao dịch"}</span>
                  <span style={{ color: "var(--primary)" }}>{Number(tx.so_tien || 0).toLocaleString()} đ</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 6 }}>
                  <div>Ví: {tx.vi || "N/A"} | Đối tượng: {tx.doi_tuong || "N/A"} | Danh mục: {tx.danh_muc_con || "N/A"}</div>
                  <div>Ghi chú: {tx.ghi_chu || "Không có"}</div>
                  <div>Ngày: {tx.ngay_gd || "Hôm nay"}</div>
                </div>
              </div>
            ))}

            {txList.length === 0 && (
              <p style={{ color: "var(--muted-foreground)", textAlign: "center", margin: "20px 0" }}>
                Không tìm thấy dữ liệu giao dịch từ ảnh.
              </p>
            )}

            {txList.length > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 8,
                  background: "var(--primary)",
                  color: "white",
                  border: "none",
                  fontWeight: "bold",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <Save size={18} />
                {saving ? "Đang lưu..." : "Lưu vào Sổ giao dịch"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
