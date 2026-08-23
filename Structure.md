# Cấu trúc `Code.gs` — Sổ Thu Chi AI v2

> Mục đích: bản đồ nhanh để tìm hàm, hiểu luồng, và biết chỗ nào nên tối ưu.  
> File nguồn: `Code.gs` (~1950 dòng). Cập nhật khi tách/gộp hàm lớn.

---

## 1. Sơ đồ tổng quan

```mermaid
flowchart TB
  subgraph ENTRY["Điểm vào"]
    doGet["doGet → configui"]
    doPost["doPost → Telegram webhook"]
    onOpen["onOpen → menu Sheet"]
    onEdit["onEdit → sửa tay Log"]
  end

  subgraph TG["Telegram (Phần 3)"]
    CB[handleCallbackQuery]
    AWAIT[handleAwaitText]
    PROC[processAiTransactions]
    EDIT[Edit session / Pick list]
  end

  subgraph AI["AI (Phần 4)"]
    GEM[callGeminiAPI]
    KEYS[getShuffledKeys]
  end

  subgraph NORM["Chuẩn hóa"]
    NZ[normalizeTransaction]
  end

  subgraph MAIL["Mail (Phần 5)"]
    SCAN[scanMail]
  end

  subgraph SHEET["Sheet I/O (Phần 6)"]
    SAVE[saveBatchToSheet]
    UPD[updateRowByUniqueKey]
    DEL[deleteRowsByUniqueKeys]
    LIVE[getLiveData]
    LEARN[AI_Learning]
  end

  subgraph RPT["Báo cáo"]
    R1[sendTodayReport]
    R2[sendMonthReport]
    R3[send3MonthReport]
  end

  doPost -->|callback| CB
  doPost -->|text chờ sửa| AWAIT
  doPost -->|/report| R1
  doPost -->|/scan| SCAN
  doPost -->|ảnh/text| GEM
  GEM --> KEYS
  GEM --> PROC
  PROC --> NZ
  PROC -->|auto clear| SAVE
  PROC -->|mơ hồ| Preview
  CB --> EDIT
  CB --> SAVE
  CB --> UPD
  CB --> DEL
  SCAN --> SAVE
  EDIT --> LEARN
  LIVE --> GEM
  LIVE --> NZ
```

---

## 2. Bản đồ phần theo dòng

| Phần | Dòng (ước lượng) | Vai trò |
|------|------------------|---------|
| **1. Thiết lập & tọa độ** | 1–209 | Hằng số, config UI, webhook, menu |
| **2. Camera sửa tay Sheet** | 210–268 | `onEdit`: tự chỉnh dấu ± số tiền theo Thu/Chi |
| **3. Telegram preview/auto/sửa** | 269–1027 | Webhook, draft, callback, edit flow |
| **Chuẩn hóa GD + helpers TG** | 1028–1303 | Normalize, format message, cache JSON |
| **4. Gemini & xoay API key** | 1304–1440 | Gọi AI, retry key |
| **5. Quét mail batch** | 1442–1533 | Gmail + rule sheet → ghi Log |
| **6. Ghi Sheet & data** | 1534–1822 | CRUD Log, AI_Learning, live dict |
| **7. Tiện ích** | 1824–1879 | Telegram send/edit/delete, money, ảnh |
| **Báo cáo** | 1881–1949 | Đọc sheet `Bao Cao` → Telegram |

---

## 3. Index hàm theo nhóm

### 3.1 Phần 1 — Config & bootstrap

| Hàm | Việc làm |
|-----|----------|
| `doGet` | Serve `configui.html` |
| `maskApiKey` | Che key trước khi trả UI |
| `getConfigToUI` / `saveConfigFromUI` | Đọc/ghi Script Properties |
| `getSoNgayQuet*` / `buildGmailDateFilter` | Bộ lọc ngày quét Gmail |
| `normalizeDateInput` / `parseOwnerNamesInput` | Parse input form |
| `showConfigDialog` | Dialog trong Spreadsheet |
| `setWebhook` | Gắn webhook Telegram = URL Web App |
| `onOpen` | Menu: Cấu hình / Quét mail |

**Hằng số quan trọng**

- `LOG_COL` — index cột vùng tên `Log` (0-based)
- `DRAFT_TTL` / `UNDO_TTL` / `EDIT_SESS_TTL` / `OPTS_PAGE_SIZE`
- `AI_LEARNING_SHEET` = `'AI_Learning'`

---

### 3.2 Phần 2 — Sheet trigger

| Hàm | Việc làm |
|-----|----------|
| `onEdit` | Trong vùng `Log`: Chi → số âm, Thu → số dương |

---

### 3.3 Phần 3 — Telegram core

**Entrypoint & pipeline**

| Hàm | Việc làm |
|-----|----------|
| `doPost` | Webhook: lock `update_id` → callback / await / lệnh / AI |
| `processAiTransactions` | Normalize từng GD → auto-commit hoặc preview + draft cache |
| `handleCallbackQuery` | Router nút: confirm / undo / edit / pick / page / custom |

**Draft & commit**

| Hàm | Việc làm |
|-----|----------|
| `previewKeyboard` / `committedKeyboard` | Inline keyboard |
| `commitDraft` | Ghi sheet + nút hoàn tác |
| `undoCommitted` | Xóa dòng theo unique keys |

**Edit flow (phiên sửa)**

| Hàm | Việc làm |
|-----|----------|
| `startEditFlow` → `showEditMenu` | Mở menu chọn field |
| `beginFieldEdit` → `showPickList` / `beginCustomInput` | Chọn từ sổ hoặc nhập tay |
| `applyPickValue` / `handleAwaitText` | Áp giá trị / nhận text |
| `resolveCustomDictValue` / `handleCustomChoice` | Custom + hỏi thêm sổ tay |
| `confirmEditSessionSave` | Diff → update sheet + `saveAiLearning` |
| `openEditSession` / `getEditSession` / `applyToEditSession` | Cache phiên sửa |
| `editSessKey` / `deepCopyTx` | Key cache + copy |
| `getSheetFingerprint` / `readLogRowByUniqueKey` | Đọc lại Log theo UNIQUE_KEY |
| `addToNotebook` | Thêm ví/DM/ĐT vào sheet danh mục |

---

### 3.4 Chuẩn hóa GD + helpers

| Hàm | Việc làm |
|-----|----------|
| `normalizeTransaction` | Ngày, Thu/Chi, tiền, match dict → `partial` + `reasons` |
| `matchDict` / `parseMoneyToken` | Khớp sổ tay / parse số tiền |
| `snapshotTx` / `diffSnapshots` | So sánh trước–sau khi sửa |
| `formatOneTx` / `buildTxMessage` | HTML message Telegram |
| `parseQuickEdit` | Sửa nhanh kiểu `v:Momo dm:Ăn uống` |
| `suggestTopOptions` | Gợi ý theo AI_Learning |
| `fieldMapName` | Map field → nhãn |
| `putJsonCache` / `getJsonCache` | CacheService JSON |
| `answerCallback` / `clearInlineKeyboard` | Telegram UX |

**Rule tự ghi (ý tưởng):** nếu `normalizeTransaction` không còn `reasons` / không `partial` → `processAiTransactions` ghi thẳng; ngược lại gửi preview chờ confirm.

---

### 3.5 Phần 4 — Gemini

| Hàm | Việc làm |
|-----|----------|
| `getShuffledKeys` | Xáo / xoay danh sách `ai_keys` |
| `callGeminiAPI` | Prompt + liveData + ảnh; thử lần lượt key; parse JSON `giao_dich` |

---

### 3.6 Phần 5 — Quét mail

| Hàm | Việc làm |
|-----|----------|
| `triggerScanMailUI` | Chạy từ menu Sheet + alert |
| `scanMail` | Rule tab `Quet Mail` + Gmail search → batch → `saveBatchToSheet` |

---

### 3.7 Phần 6 — Sheet data

| Hàm | Việc làm |
|-----|----------|
| `saveBatchToSheet` | Append lô vào `Log` (có phục hồi lỗi) |
| `updateRowByUniqueKey` | Sửa 1 dòng theo UNIQUE_KEY |
| `deleteRowsByUniqueKeys` | Xóa (undo) |
| `loadDraftFromSheet` | Khôi phục draft từ sheet nếu mất cache |
| `ensureAiLearningSheet` / `saveAiLearning` / `getAiLessons` | Học từ lần sửa tay |
| `getLiveData` | Ví, user, danh mục, history, lessons |

---

### 3.8 Phần 7 — Utils + Báo cáo

| Hàm | Việc làm |
|-----|----------|
| `returnMsg` / `sendMessage` / `editMessage` / `deleteMessage` | Telegram API |
| `formatMoney` | Format VND |
| `getTelegramImageBase64` | Tải ảnh → base64 cho Gemini |
| `sendTodayReport` / `sendMonthReport` / `send3MonthReport` | Đọc `Bao Cao` |

---

## 4. Luồng chính (để debug / tối ưu)

### A. Nhập GD qua Telegram

```
doPost
  → (ảnh) getTelegramImageBase64
  → getLiveData + callGeminiAPI
  → processAiTransactions
       → normalizeTransaction (từng item)
       → CLEAR  → saveBatchToSheet + committedKeyboard
       → PARTIAL → Cache DRAFT_* + previewKeyboard
```

### B. Bấm nút Telegram

```
doPost → handleCallbackQuery
  → confirm_*  → commitDraft
  → undo_*     → deleteRowsByUniqueKeys
  → edit_*     → startEditFlow → … → confirmEditSessionSave
                 → updateRowByUniqueKey + saveAiLearning
```

### C. Quét mail

```
/scan | menu → scanMail
  → buildGmailDateFilter + rules "Quet Mail"
  → blacklist UNIQUE_KEY hiện có
  → batchData → saveBatchToSheet
```

### D. Config

```
Menu / Web App → configui
  → getConfigToUI / saveConfigFromUI (Script Properties)
```

---

## 5. Cache / Properties / Sheet phụ thuộc

| Key / tài nguyên | Dùng cho |
|------------------|----------|
| Script Properties (`PROP`) | `bot_token`, `admin_id`, `spreadsheet_id`, `ai_keys`, `ai_model`, `ai_prompt`, `owner_names`, `so_ngay_quet`, `quet_tu_ngay`, `quet_den_ngay` |
| Cache `LOCK_<update_id>` | Chống xử lý trùng webhook |
| Cache `DRAFT_<txId>` | Draft chờ confirm |
| Cache `AWAIT_<chatId>` | Chờ user nhập text |
| Cache `EDIT_<txId>_<idx>` | Phiên sửa |
| Named range `Log` | Sổ giao dịch chính |
| Sheet `Quet Mail` | Rule keyword mail |
| Sheet `Bao Cao` | Số liệu báo cáo |
| Sheet `AI_Learning` | Lesson từ lần sửa |

**Cột `Log` (`LOG_COL`):**  
`NGAY | PHAN_LOAI | SO_TIEN | VI | DOI_TUONG | DANH_MUC_CHA | DANH_MUC_CON | GHI_CHU | UNIQUE_KEY | STATUS`

---

## 6. Gợi ý chỗ hay tối ưu (map nhanh)

| Ưu tiên | Vùng | Lý do |
|--------|------|--------|
| Cao | `callGeminiAPI` + `getLiveData` | Quota, prompt size, latency |
| Cao | `saveBatchToSheet` / đọc toàn `Log` | I/O Sheet đắt |
| Trung bình | `handleCallbackQuery` + edit flow | Nhiều nhánh, dễ tách file |
| Trung bình | `scanMail` | Gmail search × nhiều rule |
| Thấp | Utils Telegram / format | Ổn định, ít đổi |

---

## 7. Cách dùng file này

1. Cần sửa hành vi bot → bắt đầu từ **§3.3** (`doPost` / `handleCallbackQuery`).  
2. Sai parse AI → **§3.4** `normalizeTransaction` + **§3.5** `callGeminiAPI`.  
3. Sai dấu tiền trên sheet → **§3.2** `onEdit`.  
4. Mail trùng / thiếu → **§3.6** `scanMail` + `LOG_COL.UNIQUE_KEY`.  
5. Khi tách module: giữ nguyên tên hàm public (`doPost`, `doGet`, `onEdit`, `onOpen`) — Apps Script entrypoints.
