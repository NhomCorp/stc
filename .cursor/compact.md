# 📉 CONTEXT COMPACTED (Tóm tắt thu gọn Context)

> **Phiên**: 08–09/09/2026 — UX View thay vì lộ nhiều tab Log/Report tháng
> **Cập nhật**: 09/09/2026 — phase 1 hoàn tất, điều khiển bằng sidebar.

## 🎯 Current Status & Goal
- **Mục tiêu chính**: Giảm tab UX; giữ shard `Log_MM_YYYY` / `Report_MM_YYYY` phía sau.
- **Trạng thái**: Đã code xong `7_MonthView.gs` + `viewui.html`; chờ push lên Apps Script để kiểm tra.

## 🛠️ Key Decisions & Technical Context

### Kiến trúc Hybrid (đã chốt + đã code)
- Shard tháng vẫn là nơi ghi/rebuild; **ẩn mặc định**, `onOpen`/F5 ẩn lại.
- `View_Log` + `View_Report`: hàng 1 = banner (merge A1:I1), nội dung snapshot từ hàng 2.
- **Sidebar `viewui.html`** = nơi điều khiển: dropdown tháng + nút Xem Log / Xem Report / Sửa Log / Sửa Report / Ẩn sheet tháng.
- `onOpen`: ẩn shard → nạp tháng hiện tại vào 2 View → mở sidebar.
- Sửa = `showSheet()` + activate shard gốc; F5 ẩn lại.
- Tháng đang chọn lưu ở `PROP` key `view_last_month` (menu fallback dùng lại).

### Đã loại bỏ (không hiệu quả)
- Dropdown data-validation ở B1 → Sheets ép Date, lệch list, báo lỗi.
- Ô text C1/D1 + `onSelectionChange` → bấm lại cùng ô không fire.
- Checkbox + installable onEdit; nút ảnh `assignScript`.

### File
- `7_MonthView.gs` — hide shard, load View, API sidebar (`viewSidebarState/Load/Edit/HideShards`)
- `viewui.html` — sidebar UI
- `4_SheetStore.gs` — `onOpen` bootstrap + mở sidebar; hide sau `getOrCreateMonthSheets`; Mục Lục unhide khi click
- `0_Config.gs` — `SHEET_NAMES.VIEW_LOG/VIEW_REPORT`

### Ràng buộc
- Sheet Cũ không đụng.
- Ẩn tab ≠ giảm dung lượng file.
- View = snapshot chỉ đọc; không sync 2 chiều.

## 📝 Completed Work
- [x] Chốt hybrid + 2 View + mặc định tháng hiện tại + ẩn shard mỗi F5
- [x] Thử 4 kiểu nút trên sheet → chốt sidebar
- [x] Rewrite sạch `7_MonthView.gs`, thêm `viewui.html`, dọn hack ở `onEdit`/`onSelectionChange`

## ⏳ Next Steps & Open Questions
- [ ] Push Apps Script (nhớ tạo file HTML tên `viewui`) → F5 kiểm tra sidebar + nạp tháng
- [ ] (Sau) Bảo vệ range View chỉ đọc; badge dirty; Mục Lục link "Xem tháng"
