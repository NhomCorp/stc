# 📉 Context Compact — Phiên sửa Báo cáo (26/08/2026)

## 🎯 Current Status & Goal
- **Mục tiêu**: Cải thiện lệnh báo cáo (`/report` → `rebuildBaoCao` + `send*Report`) trong `Code.gs`: (1) không ghi đè layout sheet `Bao Cao v2` (độ rộng cột, chiều cao hàng) nhưng dòng mới vẫn có định dạng đẹp; (2) giữ format số/màu nghiệp vụ; (3) làm đẹp tin nhắn báo cáo Telegram; (4) sửa logic kế toán: giao dịch CHECK **không** tính vào Thu/Chi/Lợi nhuận.
- **Trạng thái hiện tại**: HOÀN TẤT toàn bộ sửa đổi trong `Code.gs`. Chưa chạy thử thực tế trên Apps Script / Telegram.

## 🛠️ Key Decisions & Technical Context
- **File quan trọng**: `Code.gs` (duy nhất bị sửa phiên này)
  - `rebuildBaoCao()` ~dòng 2389: tính Log → ghi `Bao Cao v2!A1:E5`
  - `addToBaoBucket()` dòng 2382–2391: phân bổ thu/chi/check
  - `baoCaoCell()` + `buildBaoCaoDetail()` ~dòng 2524–2546: hàm phụ Telegram
  - `sendTodayReport` / `sendMonthReport` / `send3MonthReport` ~dòng 2548–2627
- **Kiến trúc/Giải pháp đã chốt**:
  - Format sheet **động theo `lastRow`** thay vì cứng `A1:E5`; **BỎ** `autoResizeColumns` và `setRowHeights` (bảo toàn layout chỉnh tay); chỉ giữ `setRowHeight(1, 32)` cho header.
  - Giữ format nghiệp vụ: số `#,##0;[Red]-#,##0;0` chỉ áp `B2:E{lastRow}`; cột A giữ `'@'` + căn giữa; B:E căn phải; header xanh `#1a73e8` chữ trắng; highlight dòng hôm nay `#fef7e0`; border giữ nguyên.
  - Template Telegram: Hôm nay & Tháng này **giống nhau**, dùng chung `buildBaoCaoDetail` (📥 Thu nhập / 📤 Chi tiêu / ──── / 💰 Lợi nhuận, monospace căn cột qua `baoCaoCell(label, value, labelW=11, valueW=15)`); 3 tháng dùng **Phương án A** (liệt kê LN từng tháng → tổng cộng → gom ⏳ Chưa ghi nhận xuống cuối, ẩn khi =0). Icon ⏳ thay ⚠️, cụm từ thống nhất "Chưa ghi nhận".
  - Kế toán (chuẩn Revenue Recognition): CHECK chỉ cộng `bucket.check`, **loại khỏi** `thu`/`chi` → LN sạch, chỉ giao dịch đã ghi nhận.
- **Ràng buộc/Lưu ý**:
  - Ask mode: chỉ thảo luận/phân tích, không viết code (user rule).
  - Dữ liệu đọc từ Named Range `"Log"`; `LOG_COL.STATUS` chứa `"CHECK"` xác định bằng `indexOf("CHECK") >= 0`.
  - `check` là số NET (+thu CHECK −chi CHECK), lưu dạng gốc dương/âm.

## 📝 Completed Work
- [x] `rebuildBaoCao()`: format động theo `lastRow`, bỏ `autoResizeColumns`/`setRowHeights`; sửa lỗi numberFormat đè lên cột A (khôi phục `'@'` cho `A2:A{lastRow}`).
- [x] Thêm `baoCaoCell()` (ô monospace căn trái/phải) + `buildBaoCaoDetail()` (khối Thu/Chi/LN dùng chung, kèm dòng ⏳ nếu ≠ 0).
- [x] Viết lại `sendTodayReport` (giữ nút REPORT_MONTH/REPORT_3MONTH), `sendMonthReport`, `send3MonthReport` (Phương án A).
- [x] Sửa `addToBaoBucket()`: `if (isCheck) { bucket.check += soTien; return; }` trước phần cộng thu/chi.

## ⏳ Next Steps & Open Questions
- [ ] Deploy `Code.gs` lên Apps Script, chạy `/report` kiểm tra: sheet giữ layout, dòng mới có format; tin Telegram đúng mẫu; LN không còn gồm CHECK (số LN sẽ giảm phần CHECK ở lần rebuild đầu — hành vi đúng).
- [ ] (Tuỳ chọn) Cập nhật `Structure.md` / `rule.md` phản ánh logic CHECK-mới và template Telegram.
