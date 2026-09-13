# Sổ Thu Chi AI v2 — Rule dự án

Nguồn sự thật khi sửa code. Kiến trúc **Modular** (7 file .gs + 1 html). Doc kiến trúc: `Structure.md`.

---

## 1. Vai trò file

| File | Vai trò |
|------|---------
| `0_Config.gs` | Hằng số, GID, tọa độ 9 cột, doGet Web App, menu GAS, quản lý Token |
| `1_Telegram.gs` | Webhook doPost, xử lý Text/Voice/Photo/Callback, Draft/Commit, Undo 24h |
| `2_GeminiAI.gs` | Gọi Gemini API, trích xuất JSON, chuẩn hóa giao dịch, đọc Alias & AI_Learning |
| `3_MailScanner.gs` | Quét Gmail theo Rule/Regex & AI Fallback, chống trùng UNIQUE_KEY |
| `4_SheetStore.gs` | CRUD Log_MM_YYYY, clone Template, Mục Lục, Dummy Row, onEdit/onOpen |
| `5_ReportRebuild.gs` | Hybrid báo cáo: dirty-set, rebuild Report tháng (lọc CHECK/Chưa phân loại), timestamp, trigger dirty, Hôm nay trên Bao Cao |
| `7_MonthView.gs` | View_Log / View_Report chỉ đọc; ẩn shard tháng; onOpen nạp tháng hiện tại; API cho sidebar |
| `8_OpsSidebar.gs` | Sidebar Quét Mail / Meta Billing: lưu khoảng ngày + token, chạy scan/sync |
| `9_Tools.gs` | Theme Log/Report tháng + menu Làm mới format/data Log |
| `configui.html` | Dialog/WebApp cấu hình: model, API keys, prompt, chủ TK (mail/Meta cũng có ở opsui) |
| `viewui.html` | Sidebar View tháng: dropdown tháng + nút Xem / Sửa / Ẩn sheet tháng |
| `opsui.html` | Sidebar Quét Mail / Meta: khoảng ngày, token, Check live, quét, ghi Log |
| `archive/Code.legacy.txt` | **THƯ VIỆN THAM KHẢO** — monolith cũ. Không deploy, không đổi đuôi `.gs` |
| `rule.md` | Rule nghiệp vụ + kỹ thuật (file này) |
| `Structure.md` | Kiến trúc, sơ đồ luồng, bản đồ Sheet |
| `note.md` | Gom việc / backlog |
| `feedback v2.txt` | Ghi chú migrate v1 → v2 (lịch sử) |

Trong Apps Script: HTML file name phải là `configui`, `viewui`, `opsui` (khớp `createTemplateFromFile` / `createHtmlOutputFromFile`).

---

## 2. Sheet & Cấu trúc dữ liệu

### 2.1 Nguồn dữ liệu duy nhất: `Log_MM_YYYY` (9 cột, index 0)

Hệ thống mới **chỉ ghi 1 nơi duy nhất** — sheet tháng `Log_MM_YYYY`.  
Không còn Master Log, không ghi song song.

| Index | Cột | Tên | Ghi chú |
|------:|:---:|-----|---------|
| 0 | A | Ngày | `dd/MM/yyyy` |
| 1 | B | Phân loại | Chỉ `Thu` / `Chi` |
| 2 | C | Số tiền | Chi = âm, Thu = dương |
| 3 | D | Nguồn tiền (Ví) | Cash, Bank, Credit... |
| 4 | E | Đối tượng | Bản thân, Couple, Khách lẻ... |
| 5 | F | Danh mục con | Ăn sáng, Cafe, Xăng xe, ADS... |
| 6 | G | Ghi chú | Nội dung diễn giải |
| 7 | H | Unique Key | `TX_*` (Telegram) / mã ref mail |
| 8 | I | Status | `CHECK:reason,…` khi cần review; **rỗng** khi OK |

- Tọa độ chuẩn: `MONTH_LOG_COL` trong `0_Config.gs`
- Dữ liệu bắt đầu từ **dòng 3** (dòng 1: Title, dòng 2: Header)
- Ô **B1** chứa mã tháng `MM/yyyy` — script tự động bảo vệ & khóa

### 2.2 Bản đồ Sheet

| Nhóm | Sheet | GID | Vai trò |
|------|-------|-----|---------|
| Điều hướng | `Mục Lục` | Tự động | Link nhanh tới Log & Report từng tháng |
| View (UX) | `View_Log` / `View_Report` | Tự động | Snapshot chỉ đọc; hàng 1 banner, nội dung từ hàng 2; chọn tháng ở sidebar |
| Dữ liệu | `Log_MM_YYYY` | Clone từ Template | **Nguồn gốc duy nhất** — script chỉ append; **ẩn mặc định** |
| Báo cáo tháng | `Report_MM_YYYY` | Clone từ Template | Script `rebuildReportMonth` ghi số tĩnh; **ẩn mặc định** |
| Báo cáo tổng | `Bao Cao v2` | `1475474497` | Hôm nay = script A2:E2; bảng tháng = link `Report!B3:B6`; F1 timestamp |
| Báo cáo trọn đời | `Tóm tắt_v2` | `129580313` | Lifetime: VSTACK/QUERY/SUMIFS toàn bộ Log tháng |
| Template | `Template_Log` | `192263148` | Khuôn mẫu clone Log tháng mới |
| Template | `Template_Report` | `56513848` | Khuôn mẫu clone Report tháng mới |
| Bổ trợ | `Quet Mail` | `2033507127` | Rule quét Gmail: keyword, ví, đối tượng, danh mục |
| Bổ trợ | `Alias` | `1498755942` | Map từ khóa → Ví/Danh mục/Đối tượng |
| Bổ trợ | `AI_Learning` | `203251644` | Lưu vết sửa tay để dạy AI |
| Truy vết | `Log_Chuyen` | Tự động | Lịch sử chuyển giao dịch giữa tháng |

### 2.3 Quét Mail (tab `Quet Mail`, từ hàng 2)

| Cột | Ý nghĩa | Map sang Log |
|-----|---------|-------------|
| A | Keyword (chủ đề mail) | — |
| B | Ghi chú mặc định | col 6 (có thể bị ghi đè bằng PTTT từ mail) |
| C | Nguồn tiền | col 3 |
| D | Đối tượng | col 4 |
| E | Danh mục con | col 5 |

Mail quét mặc định = **Chi**, không áp CHECK nếu các trường đầy đủ.

> **Nguyên tắc bảo vệ Sheet cũ**: Giữ nguyên vẹn tuyệt đối các sheet cũ (`Giao dịch_v2`, `Alias`, `AI_Learning`, `Quet Mail`). Xem chi tiết tại `.cursor/rules/sheet-cu-giuy-nguyen.mdc`.
>
> **Ngoại lệ phiên bản mới**: 
> 1. Báo cáo v2 (`1475474497`) **không còn thuộc danh sách bảo vệ**, được phép cập nhật toàn bộ. 
> 2. Tóm tắt_v2 (`129580313`) được phép **ghi đè phần số liệu**, chỉ bảo vệ nghiêm ngặt cột danh mục (master data).
>
> **Luồng báo cáo dùng chung**: BDK và menu phải dùng `rebuildMonthsNow_()` trong `5_ReportRebuild.gs` cho cả một tháng và toàn bộ tháng. Danh sách toàn bộ lấy từ `listReportLogMonths_()`. Không lặp lời gọi tổng hợp riêng từng tháng từ giao diện; Tóm tắt được cập nhật một lần cuối khi cả lượt không có lỗi. Giao diện chỉ chọn phạm vi, xác nhận, hiển thị kết quả và nạp lại View.

---

## 3. PropertiesService

| Key | Mục đích |
|-----|----------|
| `bot_token` | Telegram bot token |
| `admin_id` | Chat ID admin — chỉ chat này được xử lý |
| `chat_id` | Chat ID lưu từ `/start` |
| `spreadsheet_id` | ID Google Spreadsheet |
| `ai_model` | Model Gemini (mặc định `gemini-2.5-flash`) |
| `ai_prompt` | Prompt cá nhân (thói quen nhà) |
| `ai_keys` | JSON array API keys Gemini (xoay vòng) |
| `ai_key_labels` | JSON array nhãn mô tả cho keys (index-matched) |
| `owner_names` | Tên chủ tài khoản ngân hàng (suy đoán Thu/Chi) |
| `so_ngay_quet` | Số ngày quét mail (mặc định 1) |
| `quet_tu_ngay` / `quet_den_ngay` | Khoảng ngày quét Gmail tùy chọn |
| `MAIL_SCAN_TRIGGER_ON` / `_HOUR` / `_MINUTE` | Lịch quét mail hằng ngày (sidebar) |
| `META_BILLING_TRIGGER_ON` / `_HOUR` / `_MINUTE` | Lịch quét Meta hằng ngày (sidebar) |
| `config_token` | Token bảo mật URL WebApp cấu hình |
| `webhook_secret` | Secret token chống spam webhook |

---

## 4. Rule AI / Prompt

**Trong code (bắt buộc, không đưa vào textarea UI):**

- Map đúng sổ tay: Ví / Đối tượng / Danh mục con
- Phân loại rõ → `Thu` | `Chi`; thiếu căn cứ → AI trả `"Không rõ"` → code ép `Chi` + `status = CHECK`
- Không khớp danh mục → `"Chưa phân loại"` (không dùng `"Khác"`)
- Quy ước tiền: `k`=nghìn, `m/tr`=triệu, `t/tỷ`=tỷ
- Trả JSON đúng schema `{ giao_dich: [...] }`
- Alias / cấu trúc JSON do code lo

**Trong UI prompt (chỉ thói quen nhà):** biệt danh, ai chuyển = thu/chi, đơn vị tiền nhà dùng.

**Cảnh báo / CHECK:** Sau `matchDict` sổ tay — `vi` / `doi_tuong` / `danh_muc_con` không khớp → ép `"Chưa phân loại"` + `CHECK:…`. `phan_loai` = `"Không rõ"` → ép Chi + `CHECK:thu_chi`. Status dạng `CHECK:thu_chi,vi,doi_tuong,danh_muc` (ghép lý do).

---

## 5. Telegram (1_Telegram.gs)

- **Chống lặp**: cache `LOCK_{update_id}` 300s
- **Bảo mật**: bắt buộc `webhook_secret` (URL `?secret=`) + `admin_id` (text & callback). Thiếu → từ chối.
- **Đầu vào**: Text / Voice / Ảnh bill / Callback query
  - Voice → `transcribeVoiceGemini` → text
  - Ảnh → base64 → Gemini multimodal
- **Flow ghi sổ**:
  - Text/Voice/Ảnh → `callGeminiAPI` → `normalizeTransaction` → pass/fail check
  - **Pass hết** → `commitDraft` ngay → tin `✅ Đã ghi sổ` + `[✏️ Sửa]` `[↩️ Hoàn tác]` (gỡ nút sau 24h)
  - **Trượt 1+ điều kiện** → Preview `⚠️ Xác nhận` + `[✅ Ghi]` `[✏️ Sửa]` `[❌ Hủy]` (draft TTL 10 phút)
- **Sửa**: Bấm ✏️ → menu field (Số tiền/Ví/DM/…) + pick list / AWAIT nhập đúng field → nháp `EDITSESS_` → ✍️ Lưu. `⚡ Sửa nhanh` / reply lệnh tắt vẫn dùng `parseQuickEdit` (không gọi Gemini để sửa)
- **Hoàn tác**: `↩️` xóa dòng theo uniqueKey trong TTL 24h
- **Lệnh**: `/start`, `/help`, `/report`, `/scan`

---

## 6. Ghi Sheet (4_SheetStore.gs)

Khi ghi giao dịch mới (`saveBatchToMonthShards`):
1. **Lock 15s** — `LockService.getScriptLock()`
2. **Phân nhóm theo tháng** — parse `ngay_gd` → `MM_YYYY`
3. **Đảm bảo sheet tồn tại** — `getOrCreateMonthSheets` clone Template nếu tháng mới
4. **Ghi Dummy Row** — `appendRowsToMonthLog`: chèn dòng trên Dummy → copy format → ghi data
5. **Cập nhật Mục Lục** — `ensureMonthInMucLuc_` thêm hyperlink nếu chưa có
6. **Flush** — `SpreadsheetApp.flush()`

**Sửa/Xóa giao dịch:**
- `updateRowByUniqueKey(key, data)` — đoán tháng từ `TX_` / `YYYYMMDD_` → mở đúng `Log_MM_YYYY`; fallback quét các Log nếu không đoán được
- `deleteRowsByUniqueKeys(keys)` — cùng chiến lược locate theo tháng + fallback

> **Không còn ghi Master Log** — chỉ ghi `Log_MM_YYYY` duy nhất.

---

## 7. Báo cáo (Hybrid)

- **Log_MM_YYYY** = nhật ký (có CHECK / Chưa phân loại).
- **Report_MM_YYYY** = sổ cái đã ghi nhận — script `rebuildReportMonth` ghi số tĩnh (loại `CHECK*` và dòng còn `Chưa phân loại`).
- **Bao Cao v2**: dòng Hôm nay do script ghi; bảng tháng = công thức link `Report!B3:B6` (tự nhảy khi Report cập nhật).
- **Dirty-set**: mọi ghi/sửa/xóa/undo/scan/`onEdit` Log → đánh dấu tháng; badge `⚠` trên Report!D1.
- **Nấu lại**: ngay sau ghi bot/undo; `/report` (rebuild-before-read); menu **Làm mới báo cáo**; trigger 15’ chỉ tháng dirty. `scanMail` chỉ ghi Log + dirty — không nấu Report, không khớp Meta.
- **Timestamp**: Report!D1 và Bao Cao!F1 = `Cập nhật đến dd/MM/yyyy HH:mm` (chỉ khi rebuild OK). Telegram `/report` hiện cùng mốc + nút **Tháng này** / **3 tháng gần nhất**.
- Menu **cứu hộ** (submenu riêng, xác nhận YES/NO) chỉ khi hỏng cấu trúc — không dùng hàng ngày. Sau cứu hộ Bao Cao, script khôi phục ngay dòng Hôm nay (hybrid).

---

## 7b. Menu Làm mới (`9_Tools.gs`)

```
🔄 Làm mới (tháng đang mở)     → Chỉ format | Chỉ data | Format + data
🔄 Làm mới (tất cả tháng)      → Chỉ format | Chỉ data | Format + data
```

- Đứng ở `Log_MM_YYYY` hoặc `Report_MM_YYYY` khi dùng nhóm “tháng đang mở”.
- **format**: theme Log + Report từ Template (không đè giá trị).
- **data**: dry-run xem trước → xác nhận; scope all phải gõ `ALL`. Cấp `MAN_`, chuyển lệch tháng, ghi `Log_Chuyen`.
- **both**: data trước → format sau. Scope all: tái tạo Mục Lục sau data.
- Không chạy tự động trong webhook / `onOpen`.

---

## 8. UI cấu hình

**`configui.html`** (dialog / Web App): model, API key, prompt, chủ TK. Key đã lưu dạng `AIza••••xxxx`; ô còn `••••` khi Lưu → giữ key cũ.

**`opsui.html`** (sidebar, cùng kiểu `viewui`): cấu hình + chạy Quét Mail và Meta Billing.
- Mail: số ngày hoặc Từ–Đến (ưu tiên khoảng ngày) → Lưu / Quét ngay
- Meta: token (che), Business ID, lookback → Lưu / Check live / **Upload Invoice CSV** (dò ID trên Log rồi ghi thẳng dòng chưa có) / Quét API / Ghi thiếu mail → Log / Sync lại toàn bộ. Ad Account = cột A sheet `Quet Mail` (ID trong CSV phải khớp keyword)
- Lịch tự động: checkbox + giờ/phút (0/15/30/45) cho quét mail và/hoặc Meta, mỗi ngày theo timezone Apps Script → Lưu lịch
- Keyword / ví / danh mục / ID TK Ads vẫn ở sheet `Quet Mail`
- Menu **📧 Bảng điều khiển Quét Mail / Meta**; submenu **📧 Quét (không cần sidebar)** giữ alert cũ
- Chỉ một sidebar tại một thời điểm — nút chuyển qua lại với View tháng

## 8b. UI View tháng (`viewui.html`)

- Dropdown tháng + Xem Log / Xem Report / Sửa / Ẩn sheet tháng
- `onOpen` mở sidebar View; F5 ẩn shard tháng

---

## 9. Nguyên tắc khi sửa code

1. Không phá vỡ cấu trúc `MONTH_LOG_COL` (9 cột, index 0)
2. Sửa/xóa dòng chỉ cần thao tác trên `Log_MM_YYYY` (không còn Master Log)
3. Không để lộ API key thô ra UI sau khi đã lưu
4. Giữ logic `onEdit` chính xác (nhận diện `Log_*`, auto ± số tiền theo phân loại)
5. Đảm bảo cơ chế clone Template tự động hoạt động khi sang tháng mới
6. Giữ nguyên vẹn tuyệt đối các **Sheet Cũ** (xem `.cursor/rules/sheet-cu-giuy-nguyen.mdc`)
7. `archive/Code.legacy.txt` là **thư viện tham khảo** — không deploy, không đổi đuôi `.gs`
8. Auth: không để trống `webhook_secret` / `admin_id` trên production
9. `normalizeTransaction` phải khớp sổ tay (`matchDict`) và CHECK đủ `vi` / `doi_tuong` / `danh_muc` / `thu_chi` — đồng bộ với `isRowRecognized_`
