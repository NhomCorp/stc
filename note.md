# Sổ tay — gom việc rồi mới làm

Cách dùng: ghi ý tưởng / bug / ý muốn vào đây trước. Khi đủ rõ hoặc muốn làm, đánh dấu và mới sửa code.

---

## Chuẩn giữ nguyên (audit 13/09/2026) — làm tốt, sửa bug đừng phá

> Khi sửa lỗi / tối ưu: đọc mục này trước. Đây là các quyết định kiến trúc đang ổn; nếu vô tình phá thì làm lại theo đúng ý dưới đây.

### Định danh & sheet
- **GID cố định** (`GID.*` + `getSheetByGid` / `getDynamicGid_`) — không dựa tên tab. Đổi tên sheet không được làm vỡ lookup.
- **Sheet Cũ bảo vệ tuyệt đối** (rule `sheet-cu-giuy-nguyen`): không sửa flow/cấu trúc `Giao dịch_v2`, Alias, AI_Learning, Quet Mail; Tóm tắt_v2 chỉ ghi đè số liệu sau khi khớp master A/B/G/L.
- **Bao Cao v2 (GID 1475474497)** thuộc hệ mới — được phép cập nhật hybrid (Hôm nay script + link Report tháng).

### Ghi dữ liệu (Log tháng)
- **Đơn ghi duy nhất** = `Log_MM_YYYY` (9 cột). Không ghi song song master cũ.
- **Dummy Row**: `insertRowsBefore(dummy)` → copy FORMAT + DATA_VALIDATION từ dummy → `setValues`. Giữ dropdown/format 100%.
- **`saveBatchToMonthShards`**: nhóm theo tháng → append → `flush` → `notifyLogMonthsChanged_` (sau khi đã nhả LockService).
- **UNIQUE_KEY** (cột H) — chi tiết chuẩn: `Structure.md` §4.3:
  - Telegram → `TX_<epoch>_<stt>`
  - Nhập tay Sheet → `MAN_…`
  - Mail + CSV Ads → **ID giao dịch Facebook** (dự phòng mail: bank ref / `yyyyMMdd_ví_tiền` / `AI_…`)
  - Không dùng tiền tố `MAIL_*`
- **Quét nhiều hộp** (`Structure.md` §4.4): quét xong 1 hộp → ghi Log ngay (lô 10); hộp n chỉ nhận key chưa có trên Log ∪ hộp 1…n−1 (`monthKeyCache` + `ensureMonthUniqueKeys_`).
- **Đổi tháng khi sửa ngày**: `updateRowByUniqueKey` chuyển shard + xóa nguồn (không để lệch tháng âm thầm).

### Báo cáo hybrid
- Report tháng = script nấu tĩnh (`rebuildReportMonth`), lọc `CHECK*` / `Chưa phân loại` (`isRowRecognized_`).
- Bao Cao: A2:E2 = Hôm nay (script); bảng tháng = link `Report!B3:B6`; F1 / Report!D1 = timestamp hoặc badge dirty.
- **Dirty-set** (`DIRTY_REPORT_MONTHS`) + badge “Có thay đổi chưa vào báo cáo”; trigger / menu / `/report` mới nấu.
- `scanMail` / Tele / CSV ghi Log chỉ dirty — đúng thiết kế “ghi nhanh”.
- **`refreshTomTatFromReports_`**: validate Thu+Chi=Ròng (tổng + từng nhóm); thiếu nhãn master → **hủy ghi, giữ bản cũ**; lỗi giữa chừng → rollback giá trị trước đó. Không tự thêm/xóa/đổi tên danh mục master.

### Telegram & AI
- Auth cứng: bắt buộc `webhook_secret` + `admin_id` (message + callback). Không secret → từ chối toàn bộ.
- Chống trùng webhook: `LOCK_<update_id>` CacheService.
- Flow: Preview (có CHECK) → Confirm → EDITSESS_ nháp → Lưu; Undo 24h; gỡ nút ✏️/↩️ sau TTL (`PENDING_CLEAR_KEYBOARDS`).
- **Fingerprint trước ghi đè** (`getSheetFingerprint`): Sheet đổi tay sau khi mở phiên → không ghi đè, bắt tải lại.
- `normalizeTransaction` + CHECK có lý do (`CHECK:vi,doi_tuong,…`); ghi không tương tác (mail/CSV) dùng `normalizeTransactionForSheetWrite` (ép giá trị trong sổ tay).
- Config UI: mask key `••••`, merge-on-save không đè key thật; Gemini xoay vòng key (`getShuffledKeys` / `callGeminiWithKeys_`).
- LiveData cache 60s (`CACHED_LIVE_DATA_V3`); sau thêm sổ tay / AI_Learning → `invalidateLiveDataCache_`.

### Ads / Mail (trạng thái hiện tại)
- Nguồn ads: **quét mail + Invoice CSV** (máy / Drive) → `Ads_Billing_Sync` (trống = chờ, `Đã ghi`) → flush batch 10/cùng tháng → Log.
- UNIQUE_KEY mail/CSV = ID Facebook → cùng charge không ghi đôi dù về cả hai nguồn / nhiều hộp.
- **Không còn Meta Graph API** trong code deploy (đã gỡ). Mail chỉ ghi khi PTTT thẻ (`isCardPayMethod_`).
- Quet Mail B–E = default Ví / ĐT / DM / ghi chú cho cả mail và CSV.

### UX vận hành
- View_Log / View_Report = snapshot chỉ đọc; shard tháng mặc định ẩn; Sửa mới unhide.
- Menu cứu hộ Bao Cao / Tóm tắt: xác nhận YES/NO; sau đè Bao Cao phải khôi phục hybrid Hôm nay.
- Sidebar ops: 1 chỗ set trigger Mail / Báo cáo / Drive CSV.

### Khi sửa bug — checklist “đừng phá chuẩn”
1. Không bỏ GID / Dummy Row / đơn ghi Log tháng.
2. Không nấu Tóm tắt bằng cách tự thêm nhãn master.
3. Không ghi đè dòng đã sửa tay khi fingerprint lệch.
4. Không bỏ webhook_secret / admin_id / mask API key.
5. Mail/CSV vẫn đi qua UNIQUE_KEY + normalize sổ tay trước khi append.

---

## Đang gom (chưa làm)

- **Ads nguồn**: Mail (PTTT thẻ) + Invoice CSV / Drive → `Ads_Billing_Sync` → Log. Meta Graph API đã gỡ khỏi runtime.
- **Backup Meta Graph** (ý tưởng cũ, không code): nếu sau này cần đối soát API — grace period + merge mail; hiện không triển khai.

### Audit 13/09/2026 — ổn định runtime

- [x] Undo/Sửa 24h: clamp CacheService ≤6h + fallback `loadDraftFromSheet` / tiền tố TX_
- [x] `protectMonthLogB1_`: idempotent (không nhân Protected Range mỗi lần onOpen)
- [x] Webhook lock BUSY TTL 300s (tránh retry Telegram tạo lô trùng)
- [x] `loadDraftFromSheet`: sửa `getRange` numRows = lastRow−2
- [x] Bỏ `hideMonthShardPair_` khỏi `getOrCreateMonthSheets` (chỉ ẩn ở View/onOpen)
- [x] `logQuiet_` + đồng bộ tài liệu Structure (module 6 CSV, không Graph)

### Audit 26/08/2026 — lỗi còn lại (theo mức độ)

**Hiệu năng**
- `getLiveData` đọc 3 sheets / request (cache 60s) — chấp nhận được; note stale sau Alias/sửa tay.
- `rebuildReportMonth` đọc hết Log tháng — OK với volume hiện tại; tối ưu sau nếu >500 dòng/tháng.
- Ghi Telegram / mail / CSV chỉ dirty — báo cáo nấu qua trigger / menu / `/report` (chốt 14/09/2026).
- `rebuildReportMonth` đọc hết Log tháng — OK với volume hiện tại; tối ưu sau nếu >500 dòng/tháng.
- `scanMail` gọi `getOrCreateMonthSheets` theo rule — thấp; có thể cache trong 1 batch nếu rules nhiều.

**Đã loại / hạ (audit 07/09/2026)**
- `SAFE_PROP_` trong `onEdit` — không còn trong code.
- `getMonthLogUniqueKeySet_` trên hot path — chỉ tool migrate; mail đã cache `ensureMonthUniqueKeys_`.
- Race dirty rebuild sau nhả lock — by design (dirty-set + trigger).
- `isRowRecognized_` với `vi === 0` — gần như không xảy ra.

---

## Sẵn sàng làm (đã rõ, chờ làm)

### P1 (khi đụng module)
- `refreshTomTatFromReports_`: bỏ fail-hard — nấu dirty trước hoặc bỏ qua tháng lỗi + note A1
- Batch `onEdit` ± tiền (1 getValues / 1 setValues)
- Batch ghi Tóm tắt theo khối thay vì từng nhãn
- Tách callback / report khỏi `1_Telegram.gs` (~1462 dòng)
- JSDoc hàm chính: `handleCallbackQuery`, `commitDraft`, `processAiTransactions`
- Backoff nhẹ Gemini 429 trong helper chung
- `getMonthKeyFromDate`: không fallback tháng hiện tại khi ngày lỗi (trả null + CHECK)

### P2 (nice-to-have)
- `clasp` push/pull deploy
- Unit test: `parseMoneyToken`, `normalizeTransaction`, `parseQuickEdit`
- Rate limit Config UI
- Memo map GID→Sheet trong 1 execution
- View snapshot: giảm copy full mỗi onOpen

---

## Đang làm

- Update an toàn quét mail: đã bổ sung ghi phần đã đọc khi hộp lỗi, chia lô tối đa 10 cùng tháng, kiểm tra UNIQUE_KEY lại trong khóa ghi, đánh dirty trước append, nhật ký `Loi_Van_Hanh`.
- Ngày mail: chỉ lấy ngày có nhãn trong nội dung (dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy hoặc ngày … tháng … năm số); không dùng ngày nhận. Định dạng khác hiện bỏ qua và ghi lỗi, cần kiểm tra với mail thực tế.
- Chưa hoàn tất: hàng đợi chung Mail/CSV + nút Chờ/Bỏ qua + worker/khôi phục lượt treo; mã lượt chạy và bộ đếm đã ghi chính xác trong nhật ký. Chưa kiểm thử GAS/deploy.


---

## Xong

### 14/09/2026 — Báo cáo chỉ trigger / menu / /report
- [x] `notifyLogMonthsChanged_` luôn chỉ dirty (Tele, mail, CSV, sửa/xóa)
- [x] Gỡ switch “nấu sau quét” (opsui + scanMail rebuildAfter)

### 13/09/2026 — Ổn định cache / protect / webhook / View hide
- [x] Undo 24h thật (cache ≤6h + Sheet fallback)
- [x] B1 protect idempotent
- [x] Webhook BUSY 300s
- [x] `loadDraftFromSheet` range
- [x] Không ẩn shard khi bot ghi
- [x] `logQuiet_` + cập nhật Structure/note

### 07/09/2026 — Audit P0
- [x] `parseMoneyToken`: bỏ `/k/.test` loose — chỉ `nghìn` / `k$` / `\bk\b`
- [x] `callGeminiWithKeys_` dùng chung `callGeminiAPI` + `extractMailWithGeminiFallback_`
- [x] `escapeHtml`: thêm `"` → `&quot;`, `'` → `&#39;`
- [x] `note.md`: điền section Hiệu năng + backlog P1/P2

### 05/09/2026
- [x] `/report` khôi phục nút **Tháng này** / **3 tháng gần nhất** (`REPORT_MONTH` / `REPORT_3MONTH` + `sendMonthReport` / `send3MonthReport`)
- [x] Bỏ menu **🔒 Khóa toàn bộ ô B1 Log tháng** — giữ khóa tự động `onOpen` / tạo Log

### Audit fix 04/09/2026 (P0–P2)
- [x] Archive `Code.gs` → `archive/Code.legacy.txt` (không deploy)
- [x] `CHECK:doi_tuong` + `matchDict` sổ tay trong `normalizeTransaction`
- [x] Auth cứng: bắt buộc `webhook_secret` + `admin_id`
- [x] Menu cứu hộ: xác nhận YES/NO + khôi phục hybrid Hôm nay sau đè Bao Cao
- [x] `/help` + gỡ keyboard 24h + `parseLogDate_` chung tại `4_SheetStore.gs`
- [x] Đồng bộ `rule.md` / `Structure.md` với hybrid Report

### Plan triển khai (hybrid / phase)
- [x] Phase 5: Dirty-set · `rebuildReportMonth` · lock · timestamp · `/report` · `5_ReportRebuild.gs`
- [x] Phase 1–4: Auth callback · AWAIT edit · CHECK · Quick Edit · LiveData DV · Tóm tắt cứu hộ · memo spreadsheet · mail lazy keys · update/delete theo tháng

### Hệ thống cũ (archive/Code.legacy.txt + đã port)
- **Đổi nút "Điền" thành "Lưu vào sổ"** — ghi ngay / cập nhật dòng; double-tap → đã lưu; đồng bộ rule/Structure.
- **CHECK khi không rõ Thu/Chi (Audit 26/08)** — `normalizeTransaction`; `scanMail` giữ mặc định Chi.
- **Bảo mật** Webhook `secret_token` · ConfigUI `config_token` · không log URL/API Key Gemini.
- `doPost` try-catch `JSON.parse` · chống trùng `TX_` + `Math.random()` · Escape HTML Telegram.
- `scanMail` guard tab trống · Hybrid Regex → Gemini · blacklist `UNIQUE_KEY` bằng `Set`.
- Bỏ auto-confirm 45s — ghi ngay + khóa sửa 24h · gỡ keyboard hourly `PENDING_CLEAR_KEYBOARDS`.
- `/report` nút Tháng / 3 tháng · Bao Cao / Report hybrid tính bằng script.
- Telegram format tin · phiên sửa `EDITSESS_` · voice · lệnh tắt khi reply · ConfigUI ẩn key · phân tầng prompt · config quét mail.
- `onEdit` paste nhiều dòng auto ± tiền · helper Telegram/`ai_keys` · cache `getLiveData` · xóa Log theo lô.

---

## Ghi chú rời (ý tưởng / câu hỏi)

- Deploy: copy các file `*_*.gs` vào Apps Script (không paste nhầm archive legacy).
- Trigger `runClearCommittedKeyboardInterval` — lần đầu deploy cần quyền trigger; tự tạo 1 trigger hourly khi `commitDraft` lần đầu. Trigger one-shot cũ `runClearCommittedKeyboard` vẫn chạy rồi tự xóa.
