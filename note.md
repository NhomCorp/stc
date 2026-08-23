# Sổ tay — gom việc rồi mới làm

Cách dùng: ghi ý tưởng / bug / ý muốn vào đây trước. Khi đủ rõ hoặc muốn làm, đánh dấu và mới sửa code.

---

## Đang gom (chưa làm)

- Auto-confirm timer cho case rõ (sau khi đã ổn định rule pass).
- Sửa bằng giọng nói (voice).
- Lệnh tắt khi reply (`ví MB`, `380k`…).
- Sửa cả lô nhiều GD một câu — **không làm sớm** (phức tạp, dễ sửa nhầm).

---

## Sẵn sàng làm (đã rõ, chờ làm)

- 

---

## Đang làm

- 

---

## Xong

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
