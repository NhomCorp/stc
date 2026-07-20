# Cho vay / Đi vay — logic ngắn

## Ý chính (2 lớp)

| Lớp | Làm gì | Không làm gì |
|-----|--------|--------------|
| **1. Khoản vay** (tab riêng) | Hợp đồng: gốc, lãi, lịch, **còn lại** | Không thay Log |
| **2. Log thu chi** | Mỗi lần tiền thật vào/ra ví | Không tự tính dư nợ có lãi |

Muốn thấy **nợ còn lại (gốc + lãi dự kiến)** → bắt buộc có lớp 1. Chỉ ghi Log thì chỉ biết đã trả bao nhiêu tiền, **không biết lãi còn bao nhiêu**.

---

## 3 kiểu khoản vay

| Kiểu | Trả thế nào | Ví dụ |
|------|-------------|--------|
| **A. Không lãi** | Chỉ trả gốc (1 lần hoặc nhiều lần) | Cho bạn vay 5tr, trả dần |
| **B. Lãi theo kỳ** | Mỗi kỳ trả **lãi**; gốc trả cuối (hoặc cuối kỳ) | Vay 10tr, lãi 1%/tháng, cuối tháng trả lãi |
| **C. Gốc + lãi từng đợt** | Mỗi kỳ trả 1 phần gốc + lãi | Vay trả góp cố định hàng tháng |

Cùng áp dụng cho **cho vay** (phải thu) và **đi vay** (phải trả) — chỉ đảo phía.

---

## Tab `Khoan Vay` (1 dòng = 1 khoản)

| Cột | Ý nghĩa |
|-----|---------|
| ID | `KV-001` — gắn Log khi trả |
| Chiều | `Cho vay` / `Đi vay` |
| Đối tượng | Ai |
| Kiểu | `A` / `B` / `C` |
| Gốc | Số vay ban đầu |
| Lãi suất | % / kỳ (A = 0) |
| Kỳ | tháng / tuần… |
| Số kỳ | Tổng kỳ (A có thể 1) |
| Ngày bắt đầu | |
| Tổng phải trả dự kiến | Gốc + tổng lãi cả đời khoản |
| Đã trả gốc | Cộng từ các lần thanh toán |
| Đã trả lãi | Cộng từ các lần thanh toán |
| **Còn lại** | `(Gốc − đã trả gốc) + lãi còn dự kiến` |
| Status | Đang mở / Tất toán |

### Cách hiểu “còn lại”

```text
Còn lại = gốc chưa trả  +  lãi dự kiến chưa thu/trả
```

- **A:** còn lại = gốc chưa trả  
- **B:** còn lại = gốc chưa trả + (số kỳ lãi còn lại × lãi mỗi kỳ)  
- **C:** còn lại = tổng các kỳ chưa trả (mỗi kỳ đã gồm gốc+lãi), hoặc gốc dư + lãi còn lại theo lịch

---

## Log ghi gì khi có tiền chạy?

| Việc | Log `phan_loai` | Danh mục gợi ý | Ghi chú Log |
|------|-----------------|----------------|-------------|
| Giải ngân cho vay | Chi | Cho vay | `KV-001 giải ngân` |
| Nhận đi vay | Thu | Đi vay | `KV-002 giải ngân` |
| Thu/trả **gốc** | Thu hoặc Chi | Thu nợ gốc / Trả nợ gốc | `KV-001 gốc` |
| Thu/trả **lãi** | Thu hoặc Chi | Thu lãi / Trả lãi | `KV-001 lãi` |
| Trả góp (gốc+lãi 1 lần) | 1 hoặc 2 dòng | — | Có thể 1 dòng rồi tách trên tab khoản vay |

Tiền ví luôn đúng. Tab khoản vay đọc các lần trả (theo ID) để cập nhật **đã trả / còn lại**.

---

## Ví dụ nhanh

**A — Không lãi:** Cho A vay 5tr → còn lại 5tr. A trả 2tr gốc → còn lại 3tr.

**B — Lãi theo kỳ:** Đi vay 10tr, lãi 100k/tháng × 12. Tháng 1 trả lãi 100k → còn lại = 10tr + 1.1tr lãi chưa trả. Trả hết gốc cuối năm + lãi từng tháng.

**C — Gốc+lãi từng đợt:** Vay 12tr, 12 kỳ × 1.1tr (gồm gốc+lãi). Đã trả 3 kỳ → còn lại ≈ 9 kỳ × 1.1tr (hoặc đúng lịch từng kỳ).

---

## Telegram (gọn)

1. Mở khoản: `cho A vay 5tr không lãi` / `vay bank 10tr lãi 1%/tháng 12 kỳ`  
   → tạo dòng `Khoan Vay` + 1 dòng Log giải ngân  
2. Trả: `A trả 2tr gốc KV-001` / `trả lãi KV-002 100k`  
   → Log + cập nhật còn lại  
3. Xem: `/no` hoặc `/no A` → liệt kê khoản + **còn lại**

---

## Không làm (tránh rối)

- Không nhét lãi dự kiến vào riêng cột Log  
- Không chỉ cộng/trừ 4 danh mục rồi gọi là “còn lại có lãi” — thiếu lịch thì sai  
- Phase đầu: Sheet tính còn lại bằng công thức/lịch; bot chỉ tạo khoản + ghi lần trả

---

## Cần chốt

1. Tab `Khoan Vay` (hợp đồng + còn lại) có đúng hướng bạn muốn không?  
2. Trả góp (kiểu C): mỗi lần trả trên Tele ghi **1 số tổng** hay tách sẵn **gốc / lãi**?  
3. Lãi kiểu B: cố định số tiền/kỳ hay % trên gốc còn lại?
