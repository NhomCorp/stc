---
name: Refactor sheet theo tháng
overview: Dual-write giao dịch vào Log tổng + Log tháng. Bao Cao v2 giữ nguyên (hôm nay + 3 tháng). Chi tiết theo ví/đối tượng/danh mục nằm ở Tóm tắt_v2 và BaoCao_MM_YYYY. Bỏ cột F (Danh mục cha) ở giai đoạn cuối.
todos:
  - id: create-templates
    content: Tạo Template_Log + Template_BaoCao (ẩn) và hàm getOrCreateMonthSheets()
    status: pending
  - id: dual-write
    content: "Refactor saveBatchToSheet: ghi đồng thời Log tổng và Log_MM_YYYY"
    status: pending
  - id: refactor-read
    content: Refactor readLogRowByUniqueKey, updateRowByUniqueKey, deleteRowsByUniqueKeys, loadDraftFromSheet
    status: pending
  - id: build-baocao-thang
    content: "Xây rebuildBaoCaoThang(): tổng hợp theo ví/đối tượng/danh mục cho từng tháng"
    status: pending
  - id: fix-support
    content: Sửa onEdit, getLiveData, scanMail để tương thích dual-write
    status: pending
  - id: migration-script
    content: "Script migration: đọc Log tổng, chia theo tháng, ghi vào Log_MM_YYYY"
    status: pending
  - id: drop-log-tong
    content: Bỏ dual-write, xoá Log tổng, chuyển Bao Cao v2 sang đọc từ BaoCao_MM_YYYY
    status: pending
  - id: drop-col-f
    content: "Giai đoạn cuối: bỏ cột F (Danh mục cha), đánh lại LOG_COL và rà toàn bộ hàm đọc/ghi"
    status: pending
  - id: testing
    content: "Kiểm thử: ghi giao dịch (text/ảnh/voice/quét mail) → BaoCao_MM_YYYY → Bao Cao v2 → gửi Telegram"
    status: pending
isProject: false
---

## Vấn đề

File hiện tại dồn toàn bộ giao dịch vào một sheet `Log` duy nhất. Càng nhiều dòng, mọi công thức và mọi lần rebuild báo cáo đều phải quét lại toàn bộ lịch sử, gây lag.

## Mục tiêu

Giới hạn phạm vi tính toán mỗi lần ghi: chỉ chạm đến dữ liệu của tháng phát sinh, không chạm các tháng khác.

## Luồng dữ liệu

```text
Tóm tắt_v2 (master data: Wallet, userr, Category)
      | dropdown
Log tổng (Giao dịch v2)   ||   Log_MM_YYYY (theo tháng)
      |                              |
Bao Cao v2 (giữ nguyên)      BaoCao_MM_YYYY (mới)
hôm nay + 3 tháng            ví / đối tượng / danh mục
```

## Nguyên tắc bắt buộc

- `BaoCao_MM_YYYY` là **giá trị tĩnh** do script ghi bằng `setValues()`, không dùng công thức. Đây là điều kiện để việc sửa một giao dịch không kéo theo tính lại các sheet tháng khác.
- Không dùng hàm volatile (`TODAY`, `NOW`, `INDIRECT`, `OFFSET`, `RAND`) trong các sheet báo cáo tháng.
- Master data (`Wallet`, `userr`, `Category`) vẫn nằm ở `Tóm tắt_v2`, là nguồn duy nhất cho mọi dropdown. Không sao chép danh sách sang từng sheet tháng.
- `BaoCao_MM_YYYY` chỉ lưu những ví / đối tượng / danh mục **có phát sinh trong tháng đó**. Tháng không phát sinh thì hiểu là 0.

---

## Giai đoạn 1: Dual-write

### Bước 1: Sheet mẫu và hàm khởi tạo

`Template_Log` (ẩn): copy từ `Log` hiện tại, 10 cột, Data Validation trỏ về Named Range trên `Tóm tắt_v2`. Cột F vẫn giữ nhưng script ghi giá trị tĩnh thay vì ArrayFormula.

`Template_BaoCao` (ẩn): khung báo cáo tháng gồm các block
- Tổng tháng: Thu / Chi / Lợi nhuận / CHECK chưa ghi nhận
- Theo ví
- Theo đối tượng
- Theo danh mục cha
- Theo danh mục con

`getOrCreateMonthSheets(dateStr)`:
- Tính `monthKey` dạng `MM_YYYY` từ `dateStr`
- Tạo `Log_{monthKey}` trước, rồi `BaoCao_{monthKey}` (log là dữ liệu gốc, báo cáo phụ thuộc log)
- Nếu chưa có thì copy từ template, đổi tên, tạo Named Range `Log_{monthKey}`
- Trả về `{ logSheet, baoCaoSheet, monthKey }`

Vị trí thêm: Code.gs sau `ensureAiLearningSheet()` (khoảng dòng 2089).

### Bước 2: Dual-write trong saveBatchToSheet

[Code.gs:1888](Code.gs) hiện chỉ ghi vào Named Range `Log`.

Thay đổi:
1. Giữ nguyên phần ghi vào `Log` tổng để code cũ không gãy
2. Nhóm `batchData` theo `monthKey` suy ra từ `ngay_gd`
3. Mỗi nhóm gọi `getOrCreateMonthSheets()` rồi ghi vào `Log_MM_YYYY`
4. Gọi `rebuildBaoCaoThang(monthKey)`
5. Gọi `rebuildBaoCao()` để cập nhật `Bao Cao v2` như cũ

Cả ba nguồn (Telegram text, ảnh/voice, quét mail) đều đi qua `saveBatchToSheet` nên không cần sửa riêng từng nguồn.

### Bước 3: Đọc / sửa / xoá

| Hàm | Thay đổi |
|-----|----------|
| `readLogRowByUniqueKey` ([Code.gs:1080](Code.gs)) | Đọc `Log` tổng trước, nếu không thấy thì quét `Log_MM_YYYY` của tháng hiện tại ±1 |
| `getSheetFingerprint` ([Code.gs:1064](Code.gs)) | Không đổi, gọi xuống hàm trên |
| `updateRowByUniqueKey` ([Code.gs:1974](Code.gs)) | Cập nhật trên cả `Log` tổng và `Log_MM_YYYY` |
| `deleteRowsByUniqueKeys` ([Code.gs:2003](Code.gs)) | Xoá trên cả hai, nhóm key theo tháng |
| `loadDraftFromSheet` ([Code.gs:2037](Code.gs)) | Vẫn đọc `Log` tổng |

`UNIQUE_KEY` dạng `TX_{id}` không chứa thông tin tháng, nên chỉ quét tối đa 3 sheet tháng gần nhất. Mỗi sheet khoảng 500 dòng nên vẫn dưới 1 giây.

### Bước 4: Báo cáo

`rebuildBaoCaoThang(monthKey)` (hàm mới):
- Đọc `Log_{monthKey}`, không quét `Log` tổng
- Tra `Category` để suy ra danh mục cha từ danh mục con
- Tổng hợp theo ví, đối tượng, danh mục cha, danh mục con
- Ghi giá trị tĩnh vào `BaoCao_{monthKey}`

`rebuildBaoCao` ([Code.gs:2413](Code.gs)) trong giai đoạn 1 **không đổi**: vẫn đọc `Log` tổng, tính hôm nay + 3 tháng, ghi `A2:E5` của `Bao Cao v2`.

`sendTodayReport`, `sendMonthReport`, `send3MonthReport`: không đổi, vẫn đọc `Bao Cao v2`.

### Bước 5: Các hàm phụ trợ

- `onEdit` ([Code.gs:269](Code.gs)): nhận diện cả `Log` tổng và `Log_MM_YYYY` để giữ quy tắc dấu ± theo Thu/Chi
- `getLiveData` ([Code.gs:2184](Code.gs)): lấy 100 dòng lịch sử gần nhất từ `Log_{tháng hiện tại}`; phần master data giữ nguyên

## Cấu trúc sheet sau giai đoạn 1

```text
[Ẩn]  Template_Log, Template_BaoCao, AI_Learning
      Quet Mail, Alias
      Tóm tắt_v2        - master data + view toàn thời gian (không chạm)
      Giao dịch v2      - Log tổng (giữ nguyên)
      Bao Cao v2        - hôm nay + 3 tháng (không đổi)
      Log_08_2026       - tự tạo khi cần
      BaoCao_08_2026    - tự tạo khi cần
      Log_09_2026 ...
```

---

## Giai đoạn 2: Migration và bỏ Log tổng

1. Script chạy một lần: đọc `Log` tổng, chia theo tháng, ghi vào `Log_MM_YYYY`
2. Rebuild lại toàn bộ `BaoCao_MM_YYYY`
3. Đối chiếu số liệu giữa `Bao Cao v2` và tổng các `BaoCao_MM_YYYY`
4. Khi khớp: bỏ dual-write, chỉ ghi `Log_MM_YYYY`
5. Xoá `Log` tổng và Named Range `Log`
6. `rebuildBaoCao` chuyển sang đọc từ các `BaoCao_MM_YYYY`

---

## Giai đoạn 3: Bỏ cột F (Danh mục cha)

Để cuối cùng vì đây là thay đổi cấu trúc sâu, cần test lại toàn bộ flow.

- Log còn 9 cột, đánh lại `LOG_COL`: `DANH_MUC_CON` 6→5, `GHI_CHU` 7→6, `UNIQUE_KEY` 8→7, `STATUS` 9→8
- `saveBatchToSheet` ghi liền một mạch 9 cột, bỏ cơ chế tách part1 (cột 0-4) và part2 (cột 6-9)
- Mọi chỗ cần danh mục cha thì tra `Category` tại thời điểm chạy
- Điều kiện: mỗi danh mục con phải là duy nhất trong `Category`. Cần rà lại các tên trùng như "Khác" xuất hiện ở nhiều danh mục cha trước khi thực hiện bước này

---

## Ngưỡng chịu tải

Với khoảng 500 dòng mỗi tháng, chi phí ghi và rebuild gần như không đổi theo thời gian vì luôn chỉ xử lý một sheet tháng. Giới hạn thực tế còn lại là số sheet làm file mở chậm, khoảng 150-200 sheet, tương đương 12-16 năm. Khi đó mới cần archive các năm cũ sang file riêng.
