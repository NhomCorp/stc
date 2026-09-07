# Sổ tay — gom việc rồi mới làm

Cách dùng: ghi ý tưởng / bug / ý muốn vào đây trước. Khi đủ rõ hoặc muốn làm, đánh dấu và mới sửa code.

---

## Đang gom (chưa làm)

- **Backup Ads: Meta Billing + khớp Mail** — bổ sung nguồn Meta (MCP cộng đồng / Marketing API billing) song song `scanMail`.
  - Quét 2 nơi → khớp → chỉ ghi 1 lần.
  - Match ưu tiên: Invoice/Transaction ID → ngày + số tiền (± lệch) → account + ngày.
  - Mail = nguồn ghi chính (đúng ví/bank + phương thức TT); Meta = đối soát / bù khi mail thiếu.
  - **Chưa chốt:** chỉ có Meta → ghi tạm rồi merge khi mail về, hay chỉ cảnh báo “thiếu mail”.
  - Lưu ý: MCP official Meta **không** có billing; cần MCP cộng đồng + token quyền đọc `act_…`. MCP Cursor không thay `scanMail` trên Sheet — cần job/script riêng.

### Audit 26/08/2026 — lỗi còn lại (theo mức độ)

**Hiệu năng**
- `getLiveData` đọc 3 sheets / request (cache 60s) — chấp nhận được; note stale sau Alias/sửa tay.
- `rebuildReportMonth` đọc hết Log tháng — OK với volume hiện tại; tối ưu sau nếu >500 dòng/tháng.
- `scanMail` gọi `getOrCreateMonthSheets` theo rule — thấp; có thể cache trong 1 batch nếu rules nhiều.

**Đã loại / hạ (audit 07/09/2026)**
- `SAFE_PROP_` trong `onEdit` — không còn trong code.
- `getMonthLogUniqueKeySet_` trên hot path — chỉ tool migrate; mail đã cache `ensureMonthUniqueKeys_`.
- Race dirty rebuild sau nhả lock — by design (dirty-set + trigger 15').
- `isRowRecognized_` với `vi === 0` — gần như không xảy ra.

---

## Sẵn sàng làm (đã rõ, chờ làm)

### P1 (khi đụng module)
- Tách callback / report khỏi `1_Telegram.gs` (~1462 dòng)
- JSDoc hàm chính: `handleCallbackQuery`, `commitDraft`, `processAiTransactions`
- Backoff nhẹ Gemini 429 trong helper chung

### P2 (nice-to-have)
- `clasp` push/pull deploy
- Unit test: `parseMoneyToken`, `normalizeTransaction`, `parseQuickEdit`
- Rate limit Config UI

---

## Đang làm

- 

---

## Xong

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
