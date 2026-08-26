# Sổ tay — gom việc rồi mới làm

Cách dùng: ghi ý tưởng / bug / ý muốn vào đây trước. Khi đủ rõ hoặc muốn làm, đánh dấu và mới sửa code.

---

## Đang gom (chưa làm)

- Các mục Audit bảo mật / bug logic còn lại cần tiếp tục xử lý chi tiết.

### Audit 26/08/2026 — lỗi còn lại (theo mức độ)

**Hiệu năng**

---

## Sẵn sàng làm (đã rõ, chờ làm)

- 

---

## Đang làm

- 

---

## Xong

- **Đổi nút "Điền" thành "Lưu vào sổ" (Code.gs, rule.md, Structure.md)** — Nút `✍️ Điền` đã đổi thành `✍️ Lưu vào sổ` trong `showEditMenu` (dòng 713); trong `confirmEditSessionSave` bây giờ **ghi ngay vào sổ** cho bản nháp chưa lưu (gọi `commitDraft`) và cập nhật dòng Sheet cho bản đã ghi (`updateRowByUniqueKey`); double-tap khi không còn diff → báo “đã lưu”; đồng bộ tài liệu rule.md §5 & Structure.md §3.3/§4 B.

- **CHECK khi không rõ Thu/Chi (Audit 26/08)** — `normalizeTransaction()`: `phan_loai` rỗng/lạ/mơ hồ (tín hiệu Thu và Chi cùng xuất hiện hoặc không có tín hiệu) → tạm ghi `Chi` nhưng bắt buộc `CHECK` lý do `thu/chi`; prompt Gemini cho phép trả `"Không rõ"` thay vì đoán. `scanMail` giữ mặc định `Chi`, không áp rule này. `rule.md` §4 đã cập nhật.
- **Bảo mật Webhook** `secret_token` **(Audit 1)** — `setWebhook` gắn `secret_token` + `doPost` xác thực URL secret.
- **Bảo mật ConfigUI (Audit 2)** — `doGet`, `getConfigToUI`, `saveConfigFromUI` kiểm tra `config_token`.
- **Bảo mật URL Key Gemini (Audit 3)** — Triệt tiêu việc ghi log (`Logger.log`) URL request hoặc dữ liệu có thể chứa API Key thô.
- `doPost` **try-catch** `JSON.parse` **(Audit 5)** — phòng ngừa POST rác gây crash bot và Telegram retry lặp.
- **Chống trùng ID** `TX_` **(Audit 6)** — bổ sung `Math.random()` vào chuỗi ID `TX_` để tránh đè/xóa nhầm lô.
- **Escape HTML Telegram (Audit 4)** — Bọc `escapeHtml` cho `ngay_gd`, `phan_loai`, `vi`, `danh_muc_con`, `doi_tuong`, `ghi_chu`, và `reasons` trong `formatOneTx` để tránh vỡ định dạng HTML khi gửi tin nhắn Telegram.
- `scanMail` **guard tab trống (Audit 7)** — `lastRuleRow < 2` → báo chưa có rule, không gọi `getRange` với numRows = 0.
- **Gỡ nút 24h không tạo trigger mỗi lần ghi (Audit 8)** — `commitDraft` đẩy job vào prop `PENDING_CLEAR_KEYBOARDS`; 1 trigger hourly `runClearCommittedKeyboardInterval` quét hết hạn. Giữ `runClearCommittedKeyboard` cho trigger one-shot cũ tự xóa.
- `/report` **nút Tháng / 3 tháng như cũ** — tin hôm nay kèm inline `REPORT_MONTH` / `REPORT_3MONTH`.
- **Bao Cao v2 — format sheet + dấu − Tele** — `rebuildBaoCao` style header xanh / dòng hôm nay vàng / số `#,##0` âm đỏ; bỏ `setHideGridlines` (không có trên Sheet API); Tele `formatMoney(…, true)` cho LN & CHECK.
- **Báo cáo v2 — bỏ công thức, tính bằng Script** — sheet `Bao Cao v2` (A1:E1 header, A2:hôm nay, A3:A5 rolling 3 tháng); `rebuildBaoCao()` + menu `📊 Báo cáo`; `/report` → rebuild rồi gửi; `send*Report` đọc `A2:E5` 1 lần. *Việc tay:* khi ổn có thể xóa công thức sheet `Bao Cao` cũ.
- **scanMail Hybrid — Regex trước, Gemini fallback** — `extractMailWithGemini` khi regex hụt; `AI_MAIL_MAX_CALLS = 15`; tin báo `(AI xử lý X mail)`.
- **Bỏ auto-confirm 45s — ghi ngay + khóa sửa sau 24h** — pass → `commitDraft` ngay; `UNDO_TTL` 24h; trigger hourly `runClearCommittedKeyboardInterval` gỡ nút sau 24h.
- **Telegram format tin ghi sổ / preview** — `formatOneTx` + `buildTxMessage` (+ tin `✅ Đã lưu sửa`) form emoji gọn; Chi đỏ + `−`; nhiều GD `#1`/`#2`; Preview `📋 Xem trước`. `rule.md` §5.
- **Telegram nút Điền lưu ngay** — `S:` → `confirmEditSessionSave` thẳng; chống double-tap (`dirty==0` → báo đã lưu). `rule.md` §5 + `Structure.md` §3.3/§4 B.
- **Sửa bằng giọng nói (voice)** — tải voice → `transcribeVoiceGemini` → dùng như text (GD mới / await / reply).
- **Lệnh tắt khi reply** — reply tin có `TX_`*: `ví MB`, `380k`, `dm …`, `hủy` (hoặc `#2 …`) → parse + lưu ngay.
- `onEdit` **paste nhiều dòng** — batch `getValues`/`setValues` theo `e.range` ∩ Log (cột Phân loại & Số tiền); Chi → `-abs`, Thu → `+abs`; chỉ ghi khi có ô đổi. `Code.gs` `onEdit`.
- **Telegram phiên sửa** — nháp `EDITSESS_`* (TTL 30 phút); phân trang + `✍️ Nhập khác` (+ thêm sổ tay / chỉ lần này); gom nhiều field / sửa nhanh → diff tổng một lần Lưu; chống ghi đè bằng fingerprint; alias nhẹ từ `AI_Learning`. `rule.md` §5 đã cập nhật.
- **Telegram confirm / sửa Option 3** — `normalizeTransaction` + rule pass → tự ghi hoặc Preview; `✅/✏️/❌`; sửa nhanh + diff + hoàn tác; tab ẩn `AI_Learning`; nguồn chính `Code.gs` (đồng bộ `stc script 2308.json`).
- **ConfigUI ẩn API key** — ô đã mask dùng `type="text"` (hiện `AIza••••xxxx`); key mới dùng `password` khi gõ.
- **Bỏ Telegram inline keyboard (cũ)** — thay bằng luồng Preview/Auto mới; giữ callback `REPORT_`* (+ tương thích tin cũ `CONFIRM_`/`EDIT_`).
- **Phân tầng prompt AI** — ConfigUI: ô Chủ TK (`owner_names`) + prompt chỉ thói quen nhà; script cứng `k/m/tr/t` + template Thu/Chi.
- **Config quét mail** — ConfigUI: số ngày (`so_ngay_quet`, default 1) + tuỳ chọn Từ–Đến (`after`/`before`, before +1 ngày); `/scan` + menu dùng chung; keyword vẫn ở sheet Quet Mail.
- **Xử lý mục 10 (Tách helper chung)** — Gom parse `ai_keys` và gọi `UrlFetchApp` Telegram (`callTelegramApi_`) để gọn code, giảm lặp.
- **Xử lý mục 11 (Cache** `getLiveData`**)** — Đưa `CacheService` TTL 60s cho `getLiveData()` để tối ưu hiệu năng gọi Sheet liên tục khi callback Telegram.
- **Xử lý mục 12 (Đồng bộ** `normalizeTransaction`**)** — Đảm bảo phiên sửa sử dụng nhất quán dữ liệu context/cache khi tái chuẩn hóa giao dịch tránh lệch `pass`/`CHECK`.
- **Xử lý mục 13 (**`scanMail` **blacklist)** — Đổi danh sách `UNIQUE_KEY` sang `Set`, tra cứu và bổ sung ID theo O(1); vẫn giữ truy vấn Gmail riêng theo từng rule vì mỗi rule ánh xạ sang ví/đối tượng/danh mục khác nhau.
- **Xử lý mục 14 (xóa Log theo lô)** — Dùng `Set` để tìm key và gom các dòng liền kề thành dải `deleteRows`, xóa từ dưới lên thay vì gọi `deleteRow` từng dòng.
- **Mục 15** — Chưa có mô tả trong `note.md`; cần bổ sung yêu cầu trước khi triển khai.

---

## Ghi chú rời (ý tưởng / câu hỏi)

- Deploy: copy `Code.gs` vào Apps Script (file `Code`), không paste nhầm `stc script 2308.txt`.
- Trigger `runClearCommittedKeyboardInterval` — lần đầu deploy cần quyền trigger; tự tạo 1 trigger hourly khi `commitDraft` lần đầu. Trigger one-shot cũ `runClearCommittedKeyboard` vẫn chạy rồi tự xóa.

