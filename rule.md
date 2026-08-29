# Sổ Thu Chi AI v2 — Rule dự án

Nguồn sự thật khi sửa code. File chính: `Code.gs` (Apps Script), đồng bộ `stc script 2308.json`. UI: `configui.html`. Doc kiến trúc: `Structure.md` (sơ đồ hàm + luồng); chi tiết giai đoạn sheet tháng xem `.cursor/plans/refactor_sheet_theo_tháng_*.plan.md`.

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
| `Structure.md` | Sơ đồ hàm + luồng `Code.gs`; cập nhật khi tách/gộp/thêm hàm |
| `note.md` | Gom việc / backlog |

Trong Apps Script: HTML file name phải là `configui` (khớp `createHtmlOutputFromFile('configui')`).

---

## 2. Sheet & Named Range (Hệ thống ghi song song)

Dự án sử dụng **hai mô hình dữ liệu song song** để tối ưu hóa hiệu năng và bảo mật báo cáo:
- **Master Log**: Bảng ghi tổng hợp, tích lũy vô hạn.
- **Monthly Shard**: Tự động chia tách giao dịch theo từng tháng riêng biệt nhằm sinh báo cáo tĩnh theo tháng mà không làm chậm hệ thống.

### 2.1 Master Log (dải ô đặt tên `Log` - 10 cột, index 0-based)

| Index | Tên | Ghi chú |
|------:|-----|--------|
| 0 | Ngày | `dd/MM/yyyy` |
| 1 | Phân loại | Chỉ `Thu` / `Chi` |
| 2 | Số tiền | Chi = âm, Thu = dương |
| 3 | Nguồn tiền (Ví) | Named Range `Wallet` |
| 4 | Đối tượng | Named Range `userr` |
| 5 | Danh mục cha | **Không ghi từ script** — ArrayFormula tự nhảy / để trống |
| 6 | Danh mục con | Named Range `Category` (cột phụ) |
| 7 | Ghi chú | |
| 8 | UniqueKey / Tracking | Mail ref hoặc `TX_xxxxxx_i` |
| 9 | Status | `CHECK` khi cần review |

- **Quy tắc ghi lô Master Log**: Tìm dòng dummy cuối cùng (dòng Tổng/Trống để giữ định dạng). Chèn dòng **ở trên** dummy → Copy định dạng từ dòng dummy cũ → Ghi data nhảy cóc qua cột index 5.

### 2.2 Monthly Shard Log (sheet tháng `Log_MM_YYYY` - 9 cột, index 0-based)

Các sheet này được nhân bản tự động từ sheet ẩn `Template_Log` (GID `192263148`) khi có giao dịch phát sinh. Đặc trưng là **không chứa cột Danh mục cha** (ArrayFormula được đưa thẳng vào template báo cáo hoặc bỏ qua để tối ưu tốc độ đọc ghi).

| Index | Tên | Ghi chú |
|------:|-----|--------|
| 0 | Ngày | `dd/MM/yyyy` |
| 1 | Phân loại | Chỉ `Thu` / `Chi` |
| 2 | Số tiền | Chi = âm, Thu = dương |
| 3 | Nguồn tiền (Ví) | Khớp sổ |
| 4 | Đối tượng | Khớp sổ |
| 5 | Danh mục con | Khớp sổ |
| 6 | Ghi chú | |
| 7 | UniqueKey / Tracking | ID giao dịch |
| 8 | Status | `CHECK` khi cần review |

- **Bảo vệ mã định danh B1**: Ô `B1` trên sheet tháng chứa mã tháng chuẩn (dạng `MM/yyyy`). Script tự động bảo vệ, khóa ô này. Nếu người dùng vô tình sửa tay, trigger `onEdit` sẽ ngay lập tức hoàn nguyên giá trị ban đầu để chống lỗi lệch tháng dữ liệu.

### 2.3 Named Range & Các Sheet hỗ trợ khác

- `Wallet` — danh sách ví.
- `userr` — đối tượng.
- `Category` — danh mục (script lấy cột index 1).
- Tab `Quet Mail` — các từ khóa, cấu hình quét Gmail.
- Tab `Alias` — map từ khóa phân loại nhanh Telegram: `Keyword | Wallet | Categories | User | Ghi chú`; nhiều keyword cách nhau bằng dấu `|`.
- Tab `Bao Cao v2` — báo cáo nhanh hôm nay + 3 tháng gần nhất của Master Log (script ghi đè dữ liệu tĩnh, font Arial 10, Header màu xanh `#1a73e8`, dòng Hôm nay màu vàng `#fef7e0`).
- Sheet `Report_MM_YYYY` — báo cáo chi tiết từng tháng (Ví / Đối tượng / Danh mục cha / Danh mục con) tạo tự động từ `Template_BaoCao` (GID `56513848`).
- Sheet `Mục Lục` — bảng điều hướng tĩnh: liệt kê từng tháng (cột A), link nhảy nhanh sang Log tháng (cột B), và Report tháng (cột C). Script tự động update thông qua trigger `onSelectionChange` khi click vào cột Tháng.
- Tab ẩn `AI_Learning` — lưu vết bài học sửa đổi của người dùng: `Thời gian | Nội dung gốc | Field | AI đoán | User sửa | Ngữ cảnh | Số lần`.

### 2.4 Quét Mail (từ hàng 2, cột A–E)

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
| `ai_keys` | JSON array chứa danh sách các API keys để xoay vòng tránh quota |
| `ai_key_labels` | JSON array nhãn mô tả cho API keys tương ứng (index-matched) |
| `owner_names` | JSON array tên chủ tài khoản ngân hàng (dùng suy đoán Thu/Chi) |
| `so_ngay_quet` | Số ngày quét mail (mặc định 1) |
| `quet_tu_ngay` / `quet_den_ngay` | Khoảng ngày quét Gmail tùy chọn |
| `config_token` | Token bảo mật URL trang WebApp cấu hình |
| `webhook_secret` | Secret token chống spam webhook |

---

## 4. Rule AI / Prompt

**Trong code (bắt buộc, không đưa vào textarea UI):**

- Map đúng sổ tay: Ví / Đối tượng / Danh mục con.
- Phân loại rõ thì dùng `Thu` | `Chi`; nếu thiếu căn cứ Thu/Chi thì AI trả `Không rõ`, code tạm ghi `Chi` nhưng bắt buộc đặt trạng thái `CHECK` với lý do `thu/chi`.
- Không khớp danh mục → `"Chưa phân loại"` (không dùng tùy tiện `"Khác"` nếu có thể tránh).
- Quy ước tiền: `k`=nghìn, `m`=triệu (prompt cá nhân có thể bổ sung `tr`/`t`).
- Trả JSON đúng schema `giao_dich[]`.
- Alias / cấu trúc JSON do code lo.

**Trong UI prompt (chỉ thói quen nhà):** biệt danh, ai chuyển = thu/chi, đơn vị tiền nhà dùng.

**Cảnh báo / CHECK:** `vi` / `danh_muc_con` / `doi_tuong` là `"Khác"` hoặc `"Chưa phân loại"`, hoặc số tiền = 0, hoặc thiếu căn cứ rõ xác định Thu/Chi (`thu/chi`) → `status = CHECK`.

`scanMail` mặc định ghi là `Chi` và không áp rule CHECK này nếu các trường khác ổn định.

---

## 5. Telegram

- Chống lặp: cache `LOCK_{update_id}` 300s.
- Ảnh / text / **voice** → Gemini → `normalizeTransaction` + rule pass/fail.
  - Voice: tải file Telegram → `transcribeVoiceGemini` → dùng như text.
- **Pass hết** (số > 0, Thu/Chi hợp lệ, ví/ĐT/DM khớp sổ tay, ngày OK, không Khác/Chưa phân loại) → `commitDraft` ngay; tin `✅ Đã ghi sổ` + `[✏️ Sửa]` `[↩️ Hoàn tác]`; sau 24h trigger hourly gỡ nút (`runClearCommittedKeyboardInterval`).
- **Trượt 1 điều kiện** → Preview `📋 Xem trước` + `[✅ Ghi]` `[✏️ Sửa]` `[❌ Hủy]` (draft `DRAFT_{txId}`, TTL 10 phút).
- Format tin (`formatOneTx` / `buildTxMessage`): emoji gọn — `📅` / `🔵 Thu +…` hoặc `🔴 Chi −…` / `💳 · 📁` / `👤` / `📝` / `ID: TX_…`.
- **Reply lệnh tắt** vào tin có `TX_…`: `ví MB`, `380k`, `dm Ăn uống`, `hủy` (hoặc `#2 ví MB`) → parse + lưu ngay như Lưu vào sổ.
- `✏️` **Phiên sửa (nháp):**
  - Mở `EDITSESS_{txId}_{idx}` = `{ base, draft, openedAt, sheetFingerprint }` — TTL **30 phút**; chưa đụng Sheet đến khi Lưu vào sổ.
  - Nút 1 field / ⚡ sửa nhanh → gom vào nháp; `✍️ Lưu vào sổ` → lưu ngay (Sheet / nháp Preview); double-tap khi không còn diff → báo đã lưu.
  - List ví/DM/ĐT: phân trang + `✍️ Nhập khác`; khớp sổ tay / alias `AI_Learning` → dùng mục chuẩn; mới → `➕ Thêm vào sổ tay` hoặc `Chỉ dùng lần này` (có thể `CHECK`).
  - GD đã ghi: so fingerprint dòng lúc mở vs lúc Lưu vào sổ; khác → báo đã đổi, `🔄 Tải lại`, không `setValues` đè.
  - Cập nhật **đúng dòng** (`uniqueKey` trên cả Master Log lẫn Sheet tháng); ghi `AI_Learning`.
- `↩️ Hoàn tác`: xóa dòng theo `txId` trong TTL **24h** trên cả hai sheet Log tổng và Log tháng phát sinh.
- Lệnh: `/start`, `/report` (rebuild rồi gửi hôm nay + nút `📆 Tháng này` / `📅 3 tháng gần nhất`), `/scan`.
- Báo cáo:
  - `rebuildBaoCao()` ghi `Bao Cao v2` từ Log tổng.
  - `rebuildBaoCaoThang(monthKey)` ghi `Report_MM_YYYY` từ Log tháng.
  - `send*Report` đọc dữ liệu, format số và gửi về Telegram qua HTML format.
- Quét mail: regex trước; regex hụt → `extractMailWithGemini` (tối đa `AI_MAIL_MAX_CALLS`); tin báo `(AI xử lý X mail)`.

---

## 6. Ghi Sheet (Cơ chế đồng bộ song song)

Khi ghi một hoặc nhiều giao dịch mới (`saveBatchToSheet`):
1. **Lock 15s**: Đảm bảo đồng nhất luồng ghi.
2. **Ghi Master Log**:
   - Tự động bù cột nếu sheet bị thiếu cột.
   - Chèn dòng trên dummy, copy format từ dummy.
   - Tách làm 2 phần `setValues` để nhảy cóc qua cột index 5 (Danh mục cha).
3. **Ghi Monthly Shards**:
   - Phân loại các giao dịch theo tháng (`MM_YYYY`).
   - Gọi `getOrCreateMonthSheets` để đảm bảo sheet tháng `Log_MM_YYYY` và sheet báo cáo `Report_MM_YYYY` đã được khởi tạo.
   - Append dòng giao dịch (9 cột) vào sheet tháng tương ứng.
   - Gọi `rebuildBaoCaoThang(monthKey)` để làm mới số liệu tĩnh của tháng đó.
   - Gọi `ensureMonthInMucLuc_(monthKey)` để ghi nhận/cập nhật link vào trang điều hướng `Mục Lục`.
4. **Rebuild chung**: Gọi `rebuildBaoCao()` cập nhật lại dữ liệu tab `Bao Cao v2`.

---

## 7. UI cấu hình (`configui.html`)

- Model + nhiều API key + nhãn key + prompt tùy chọn + chủ tài khoản + khoảng ngày quét mail.
- **Key đã lưu phải che khi hiện** dạng `AIza••••xxxx` (4 ký tự đầu + 4 cuối).
- Ô còn chứa `••••` khi Lưu → **giữ key cũ** cùng vị trí; chỉ ghi đè khi user nhập key mới đầy đủ.
- Hint prompt: không bảo user paste Alias/JSON schema vào textarea.

---

## 8. Nguyên tắc khi sửa code

- Không phá vỡ cấu trúc và thứ tự định vị `LOG_COL` (Master Log - 10 cột) và `MONTH_LOG_COL` (Sheet tháng - 9 cột).
- Không ghi đè cột danh mục cha (index 5) của Master Log.
- Khi sửa đổi dòng (`updateRowByUniqueKey`) hoặc xóa dòng (`deleteRowsByUniqueKeys`), bắt buộc phải thực hiện trên **cả hai sheet** (Master Log và Monthly Shard Log thích hợp).
- Không để lộ API key thô ra UI sau khi đã lưu.
- Giữ logic `onEdit` hoạt động chính xác trên cả hai mô hình (nhận diện qua tên sheet `Log_MM_YYYY`).
- Đảm bảo cơ chế tự động tạo sheet tháng hoạt động hoàn toàn tự động, trơn tru.
