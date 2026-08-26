# Sổ Thu Chi AI v2 — Rule dự án

Nguồn sự thật khi sửa code. File chính: `Code.gs` (Apps Script), đồng bộ `stc script 2308.json`. UI: `configui.html`.

---

## 1. Vai trò file

| File | Vai trò |
|------|---------|
| `Code.gs` | **Nguồn chính** — Telegram, Gemini, quét mail, ghi Sheet, báo cáo, Properties |
| `stc script 2308.json` | Bản đồng bộ với `Code.gs` (tiện diff/backup); deploy lấy từ `Code.gs` |
| `stc script 2308.txt` | Bản cũ — không sửa tiếp |
| `configui.html` | Dialog/WebApp cấu hình: model, API keys, prompt cá nhân, chủ TK, quét mail |
| `feedback v2.txt` | Ghi chú migrate v1 → v2 (cấu trúc Sheet) |
| `rule.md` | Rule nghiệp vụ + kỹ thuật (file này) |
| `note.md` | Gom việc / backlog |

Trong Apps Script: HTML file name phải là `configui` (khớp `createHtmlOutputFromFile('configui')`).

---

## 2. Sheet & Named Range

### Log (dải ô tên `Log`) — thứ tự cột (index 0)

| Index | Tên | Ghi chú |
|------:|-----|--------|
| 0 | Ngày | `dd/MM/yyyy` |
| 1 | Phân loại | Chỉ `Thu` / `Chi` |
| 2 | Số tiền | Chi = âm, Thu = dương |
| 3 | Nguồn tiền (Ví) | Named Range `Wallet` |
| 4 | Đối tượng | Named Range `userr` |
| 5 | Danh mục cha | **Không ghi từ script** — ArrayFormula / để trống |
| 6 | Danh mục con | Named Range `Category` (cột phụ) |
| 7 | Ghi chú | |
| 8 | UniqueKey / Tracking | Mail ref hoặc `TX_xxxxxx_i` |
| 9 | Status | `CHECK` khi cần review |

Hàng cuối bảng = Tổng (dòng dummy giữ format). Ghi lô: chèn **trên** dummy → copy format từ dummy → ghi data.

### Named Range khác

- `Wallet` — danh sách ví
- `userr` — đối tượng
- `Category` — danh mục (script lấy cột index 1)
- Tab `Quet Mail` — rule quét mail
- Tab `Bao Cao v2` — số liệu báo cáo Telegram (Script ghi, không công thức); sheet `Bao Cao` cũ có thể xóa sau khi ổn

### Quet Mail (từ hàng 2, cột A–E)

| Cột | Ý nghĩa | Map sang Log |
|-----|---------|--------------|
| A | Keyword (chủ đề mail) | — |
| B | Ghi chú mặc định | Log col 7 (có thể bị ghi đè bằng PTTT) |
| C | Nguồn tiền | Log col 3 |
| D | Đối tượng | Log col 4 |
| E | Danh mục con | Log col 6 |

Mail quét mặc định = **Chi**; danh mục cha để trống.

---

## 3. PropertiesService

| Key | Mục đích |
|-----|----------|
| `bot_token` | Telegram bot |
| `admin_id` | Chỉ chat này được xử lý |
| `spreadsheet_id` | ID Sheet |
| `ai_model` | Model Gemini (mặc định `gemini-2.5-flash`) |
| `ai_prompt` | Prompt cá nhân (thói quen nhà) |
| `ai_keys` | JSON array API keys |
| `owner_names` | JSON array tên chủ TK (suy Thu/Chi) |
| `so_ngay_quet` | Số ngày quét mail (mặc định 1) |
| `quet_tu_ngay` / `quet_den_ngay` | Tuỳ chọn khoảng ngày Gmail |

---

## 4. Rule AI / Prompt

**Trong code (bắt buộc, không đưa vào textarea UI):**

- Map đúng sổ tay: Ví / Đối tượng / Danh mục con
- Phân loại chỉ `Thu` | `Chi`
- Không khớp → `"Chưa phân loại"` (không dùng tùy tiện `"Khác"` nếu có thể tránh)
- Quy ước tiền: `k`=nghìn, `m`=triệu (prompt cá nhân có thể bổ sung `tr`/`t`)
- Trả JSON đúng schema `giao_dich[]`
- Alias / cấu trúc JSON do code lo

**Trong UI prompt (chỉ thói quen nhà):** biệt danh, ai chuyển = thu/chi, đơn vị tiền nhà dùng.

**Cảnh báo / CHECK:** `vi` / `danh_muc_con` / `doi_tuong` là `"Khác"` hoặc `"Chưa phân loại"`, hoặc số tiền = 0 → `status = CHECK`.

---

## 5. Telegram

- Chống lặp: cache `LOCK_{update_id}` 300s
- Ảnh / text / **voice** → Gemini → `normalizeTransaction` + rule pass/fail
  - Voice: tải file Telegram → `transcribeVoiceGemini` → dùng như text (GD mới, await sửa, hoặc reply lệnh tắt)
- **Pass hết** (số > 0, Thu/Chi hợp lệ, ví/ĐT/DM khớp sổ tay, ngày OK, không Khác/Chưa phân loại) → `commitDraft` ngay; tin `✅ Đã ghi sổ` + `[✏️ Sửa]` `[↩️ Hoàn tác]`; sau 24h trigger gỡ nút (`runClearCommittedKeyboard`)
- **Trượt 1 điều kiện** → Preview `📋 Xem trước` + `[✅ Ghi]` `[✏️ Sửa]` `[❌ Hủy]` (draft `DRAFT_{txId}`, TTL 10 phút)
- Format tin (`formatOneTx` / `buildTxMessage`): emoji gọn — `📅` / `🔵 Thu +…` hoặc `🔴 Chi −…` / `💳 · 📁` / `👤` / `📝` / `ID: TX_…`
- **Reply lệnh tắt** vào tin có `TX_…`: `ví MB`, `380k`, `dm Ăn uống`, `hủy` (hoặc `#2 ví MB`) → parse + lưu ngay như Điền
- `✏️` **Phiên sửa (nháp):**
  - Mở `EDITSESS_{txId}_{idx}` = `{ base, draft, openedAt, sheetFingerprint }` — TTL **30 phút**; chưa đụng Sheet đến khi Điền
  - Nút 1 field / ⚡ sửa nhanh → gom vào nháp; `✍️ Điền` → lưu ngay (Sheet / nháp Preview); double-tap khi không còn diff → báo đã lưu
  - List ví/DM/ĐT: phân trang + `✍️ Nhập khác`; khớp sổ tay / alias `AI_Learning` → dùng mục chuẩn; mới → `➕ Thêm vào sổ tay` hoặc `Chỉ dùng lần này` (có thể `CHECK`)
  - GD đã ghi: so fingerprint dòng lúc mở vs lúc Điền; khác → báo đã đổi, `🔄 Tải lại`, không `setValues` đè
  - Cập nhật **đúng dòng** (`uniqueKey`); ghi `AI_Learning`
- `↩️ Hoàn tác`: xóa dòng theo `txId` trong TTL **24h**
- Lệnh: `/start`, `/report` (rebuild rồi gửi hôm nay + nút `📆 Tháng này` / `📅 3 tháng gần nhất`), `/scan`
- Báo cáo: `rebuildBaoCao()` ghi `Bao Cao v2` + format UI/số (âm đỏ); `send*Report` đọc `A2:E5` 1 lần, LN/CHECK dùng `formatMoney(…, true)`; callback `REPORT_*`
- Quét mail: regex trước; regex hụt → `extractMailWithGemini` (tối đa `AI_MAIL_MAX_CALLS`); tin báo `(AI xử lý X mail)`
- Tin cũ `CONFIRM_`/`EDIT_`: gỡ nút / cố mở sửa nếu còn dữ liệu

### Tab ẩn `AI_Learning`

Cột: Thời gian | Nội dung gốc | Field | AI đoán | User sửa | Ngữ cảnh | Số lần. Prompt ưu tiên bài học trước lịch sử Log.

---

## 6. Ghi Sheet (bắt buộc giữ)

1. Lock 15s
2. Đủ cột (≥ startCol + 9) — thiếu thì insert cột
3. Nhảy cột danh mục cha khi `setValues` (part1: 5 cột từ startCol; part2: 4 cột từ startCol+6)
4. Dummy row + copy format
5. Chi → số âm; Thu → số dương
6. `onEdit`: đổi Phân loại / Số tiền vẫn giữ quy ước dấu — xử lý **batch** theo `e.range` ∩ Log (paste nhiều dòng); chỉ `setValues` khi có ô đổi; không quét cả Log

---

## 7. UI cấu hình (`configui.html`)

- Model + nhiều API key + prompt
- **Key đã lưu phải che khi hiện** dạng `AIza••••xxxx` (4 ký tự đầu + 4 cuối)
- Ô còn chứa `••••` khi Lưu → **giữ key cũ** cùng vị trí; chỉ ghi đè khi user nhập key mới đầy đủ
- Hint prompt: không bảo user paste Alias/JSON schema vào textarea

---

## 8. Việc đang / cần update

### Đã xác định lệch

1. **Mask API key chưa khớp:** hint UI mô tả `••••` + giữ key cũ, nhưng `getConfigToUI` trả key đầy đủ và `saveData` lưu nguyên chuỗi — chưa mask / merge thật.
2. Tên file script `.json` dễ nhầm (nội dung Apps Script); khi deploy vẫn paste vào `.gs` trên GAS.

### Chiến dịch update (thứ tự)

1. [x] Sửa mask + merge key: `getConfigToUI` / `saveConfigFromUI` + `configui.html`
2. [x] Rà soát prompt động vs hint UI (cảnh báo Telegram nhận cả `Khác` và `Chưa phân loại`)
3. [x] `Code.gs` nguồn chính; pass → ghi ngay + sửa/hoàn tác 24h; `Bao Cao v2`; scanMail hybrid AI
4. [ ] (Tuỳ chọn) Dọn / archive `stc script 2308.txt`
5. [ ] (Tuỳ chọn) Xóa sheet `Bao Cao` cũ sau khi `Bao Cao v2` ổn

---

## 9. Nguyên tắc khi sửa code

- Không phá Named Range `Log` / thứ tự `LOG_COL`
- Không ghi đè cột danh mục cha (index 5)
- Không bỏ lock / dummy / copy format khi ghi lô
- Không lộ raw API key ra UI sau khi đã lưu
- Prompt cá nhân ≠ system JSON schema
- Ưu tiên sửa tối thiểu, đúng rule trên
