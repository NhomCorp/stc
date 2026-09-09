# 📉 CONTEXT COMPACTED (Tóm tắt thu gọn Context)

> **Phiên**: 08–09/09/2026 — UX View thay vì lộ nhiều tab Log/Report tháng  
> **Mục tiêu**: Giữ logic/quyết định kỹ thuật; chưa implement code.

## 🎯 Current Status & Goal
- **Mục tiêu chính**: Giảm số tab người dùng thấy (mỗi tháng đẻ 2 sheet Log+Report → UX kém), vẫn giữ kiến trúc ghi shard phía sau.
- **Trạng thái hiện tại**: Đã **chốt hướng kiến trúc** (thảo luận only). **Chưa viết code**.

## 🛠️ Key Decisions & Technical Context

### Kiến trúc đã chốt (Hybrid)
- **Giữ** `Log_MM_YYYY` + `Report_MM_YYYY` làm nơi lưu/rebuild (bot Telegram, Mail, dirty rebuild như hiện tại).
- **Ẩn** toàn bộ shard tháng mặc định → thanh sheet không phình.
- Thêm lớp **View chỉ đọc**: chọn tháng → bấm **Xem** mới load snapshot → tiết kiệm tài nguyên.
- Nút **Sửa**: unhide + activate sheet gốc (`Log_…` hoặc `Report_…`), **không** sửa 2 chiều trên View.
- Đổi dropdown tháng **không** auto-load; chỉ load khi bấm Xem.
- Sau sửa trên sheet gốc: View chỉ cập nhật khi bấm Xem lại; dirty/rebuild Report giữ flow cũ (`notifyLogMonthsChanged_` / `rebuildReportMonth`).

### Không làm (đã loại)
- Bỏ shard / chỉ 1 Master + dropdown thay lưu trữ → rủi ro lock, quota, đụng mail/unique key.
- Template trống + chọn tháng “tự ra dữ liệu” → không khả thi với flow ghi hiện tại.
- Auto-load khi đổi tháng; sửa trực tiếp trên View (phase 1).

### Flow View (phase 1)
```
Chọn tháng → [Xem] nạp Log/Report vào View → [Sửa] mở sheet gốc ẩn
```

### File / module liên quan (tham chiếu, chưa sửa phiên này)
- `4_SheetStore.gs` — `getOrCreateMonthSheets`, `saveBatchToMonthShards`, Mục Lục
- `5_ReportRebuild.gs` — dirty-set, `rebuildReportMonth`, `notifyLogMonthsChanged_`
- `9_Tools.gs` — sync theme Template_Log / Template_Report → shard tháng
- `0_Config.gs` — `GID.TEMPLATE_LOG`, `GID.TEMPLATE_REPORT`
- Sheet Mới: `Template_Log`, `Template_Report`, `Log_MM_YYYY`, `Report_MM_YYYY`, Mục Lục
- **Sheet Cũ**: không đụng (`Giao dịch_v2`, `Bao cao_v2`, `Tóm tắt_v2`, Alias, AI_Learning, Quet Mail)

### Ràng buộc / lưu ý
- Rule flow-discussion: phiên này chỉ bàn logic; code khi user yêu cầu implement.
- Rule sheet-cũ: tuyệt đối không sửa sheet/flow Cũ.
- Ẩn tab ≠ giảm dung lượng file; shard vẫn tồn tại phía sau.
- Chưa chốt UI: **2 sheet View** (`View_Log` + `View_Report`) vs **1 sheet 2 vùng**; nút = **menu Apps Script** vs **nút vẽ trên sheet**.

## 📝 Completed Work
- [x] Phân tích ý tưởng “Excel: template + chọn tháng” vs shard hiện tại.
- [x] Chốt hybrid: shard ẩn + View đọc + Xem mới load + Sửa → gốc.
- [x] Làm rõ pain UX: N tháng → 2N tab → cần ẩn + View.

## ⏳ Next Steps & Open Questions
- [ ] User chốt: 1 hay 2 sheet View; nút menu hay drawing button.
- [ ] Implement phase 1 (khi được yêu cầu): hide sau `getOrCreateMonthSheets` + tool ẩn hàng loạt; View + dropdown + Xem + Sửa; bảo vệ range View chỉ đọc.
- [ ] (Sau) Mục Lục link “Xem tháng”; badge dirty trên View; menu ẩn lại sheet sau khi sửa.
- [ ] Không xóa shard; không đổi Sheet Cũ.
