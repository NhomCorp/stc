# Sổ tay — gom việc rồi mới làm

Cách dùng: ghi ý tưởng / bug / ý muốn vào đây trước. Khi đủ rõ hoặc muốn làm, đánh dấu và mới sửa code.

---

## Đang gom (chưa làm)

- Sửa cả lô nhiều GD một câu — **không làm sớm** (phức tạp, dễ sửa nhầm).

---

## Sẵn sàng làm (đã rõ, chờ làm)

- 

---

## Đang làm

- 

---

## Xong

- **`/report` nút Tháng / 3 tháng như cũ** — tin hôm nay kèm inline `REPORT_MONTH` / `REPORT_3MONTH`.
- **Bao Cao v2 — format sheet + dấu − Tele** — `rebuildBaoCao` style header xanh / dòng hôm nay vàng / số `#,##0` âm đỏ; bỏ `setHideGridlines` (không có trên Sheet API); Tele `formatMoney(…, true)` cho LN & CHECK.
- **Báo cáo v2 — bỏ công thức, tính bằng Script** — sheet `Bao Cao v2` (A1:E1 header, A2:hôm nay, A3:A5 rolling 3 tháng); `rebuildBaoCao()` + menu `📊 Báo cáo`; `/report` → rebuild rồi gửi; `send*Report` đọc `A2:E5` 1 lần. *Việc tay:* khi ổn có thể xóa công thức sheet `Bao Cao` cũ.
- **scanMail Hybrid — Regex trước, Gemini fallback** — `extractMailWithGemini` khi regex hụt; `AI_MAIL_MAX_CALLS = 15`; tin báo `(AI xử lý X mail)`.
- **Bỏ auto-confirm 45s — ghi ngay + khóa sửa sau 24h** — pass → `commitDraft` ngay; `UNDO_TTL` 24h; trigger `runClearCommittedKeyboard` gỡ nút sau 24h.
- **Telegram format tin ghi sổ / preview** — `formatOneTx` + `buildTxMessage` (+ tin `✅ Đã lưu sửa`) form emoji gọn; Chi đỏ + `−`; nhiều GD `#1`/`#2`; Preview `📋 Xem trước`. `rule.md` §5.
- **Telegram nút Điền lưu ngay** — `S:` → `confirmEditSessionSave` thẳng; chống double-tap (`dirty==0` → báo đã lưu). `rule.md` §5 + `Structure.md` §3.3/§4 B.
- **Sửa bằng giọng nói (voice)** — tải voice → `transcribeVoiceGemini` → dùng như text (GD mới / await / reply).
- **Lệnh tắt khi reply** — reply tin có `TX_*`: `ví MB`, `380k`, `dm …`, `hủy` (hoặc `#2 …`) → parse + lưu ngay.
- **`onEdit` paste nhiều dòng** — batch `getValues`/`setValues` theo `e.range` ∩ Log (cột Phân loại & Số tiền); Chi → `-abs`, Thu → `+abs`; chỉ ghi khi có ô đổi. `Code.gs` `onEdit`.
- **Telegram phiên sửa** — nháp `EDITSESS_*` (TTL 30 phút); phân trang + `✍️ Nhập khác` (+ thêm sổ tay / chỉ lần này); gom nhiều field / sửa nhanh → diff tổng một lần Lưu; chống ghi đè bằng fingerprint; alias nhẹ từ `AI_Learning`. `rule.md` §5 đã cập nhật.
- **Telegram confirm / sửa Option 3** — `normalizeTransaction` + rule pass → tự ghi hoặc Preview; `✅/✏️/❌`; sửa nhanh + diff + hoàn tác; tab ẩn `AI_Learning`; nguồn chính `Code.gs` (đồng bộ `stc script 2308.json`).
- **ConfigUI ẩn API key** — ô đã mask dùng `type="text"` (hiện `AIza••••xxxx`); key mới dùng `password` khi gõ.
- **Bỏ Telegram inline keyboard (cũ)** — thay bằng luồng Preview/Auto mới; giữ callback `REPORT_*` (+ tương thích tin cũ `CONFIRM_`/`EDIT_`).
- **Phân tầng prompt AI** — ConfigUI: ô Chủ TK (`owner_names`) + prompt chỉ thói quen nhà; script cứng `k/m/tr/t` + template Thu/Chi.
- **Config quét mail** — ConfigUI: số ngày (`so_ngay_quet`, default 1) + tuỳ chọn Từ–Đến (`after`/`before`, before +1 ngày); `/scan` + menu dùng chung; keyword vẫn ở sheet Quet Mail.

---

## Ghi chú rời (ý tưởng / câu hỏi)

- Deploy: copy `Code.gs` vào Apps Script (file `Code`), không paste nhầm `stc script 2308.txt`.
- Trigger `runClearCommittedKeyboard` — lần đầu deploy cần quyền trigger; trigger tự xóa sau khi chạy.
- Sheet `Bao Cao` cũ (công thức): giữ tạm đến khi `Bao Cao v2` chạy ổn rồi xóa tay.
