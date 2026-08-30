---
name: Refactor sheet theo tháng (Hoàn chỉnh)
overview: Kiến trúc dual-write. Giao dịch_v2 (Log tổng) giữ nguyên 10 cột gồm cột F Danh mục cha. Log_MM_YYYY (Log tháng, nhân bản từ Template_Log) bỏ hẳn cột F, chỉ còn 9 cột. Hai lớp chạy song song, mỗi lớp dùng bản đồ cột riêng; giai đoạn cuối mới gỡ Log tổng. Báo cáo tháng gồm 4 bảng chi tiết (Ví, Đối tượng, Danh mục cha, Danh mục con).
todos:
  - id: user-prep
    content: User chuẩn bị Template_Log (9 cột, bỏ cột F) và Template_BaoCao (ẩn), báo lại toạ độ
    status: completed
  - id: code-colmap
    content: Thêm MONTH_LOG_COL (9 cột) và getOrCreateMonthSheets(dateStr)
    status: completed
  - id: code-dual-write
    content: Dual-write trong saveBatchToSheet, ghi Log tổng (10 cột) và Log_MM_YYYY (9 cột)
    status: completed
  - id: code-report-thang
    content: Viết rebuildBaoCaoThang(monthKey) cho 4 bảng chi tiết
    status: completed
  - id: code-sync
    content: Đồng bộ update/delete/read + onEdit + getLiveData cho cả 2 lớp log
    status: completed
  - id: final-merge
    content: "Giai đoạn cuối: migration, gỡ Log tổng, chuyển Bao Cao v2 đọc từ báo cáo tháng"
    status: pending
  - id: final-test
    content: Test toàn bộ luồng thực tế (text/ảnh/voice/quét mail)
    status: pending
isProject: false
---

# Kế hoạch Refactor Sổ Thu Chi theo Tháng (Hoàn chỉnh)

> Bản chuẩn xuyên suốt. Bản `9f9d4b15` chỉ giữ làm tham khảo lịch sử, không dùng để triển khai.

## 0. Quyết định cốt lõi (chốt)

- `Giao dịch_v2` / Named Range `Log`: GIỮ NGUYÊN 10 cột, còn nguyên cột F `Danh mục cha`. Không đụng vào.
- `Template_Log` và mọi `Log_MM_YYYY`: BỎ HẲN cột F ngay từ đầu, chỉ còn 9 cột.
- Hai lớp chạy song song (dual-write). Sau khi ổn định mới gỡ nhánh Log tổng.
- Code dùng 2 bản đồ cột riêng, chịu trách nhiệm chuyển đổi dữ liệu giữa 2 layout.
- `BaoCao_MM_YYYY`: Tổng hợp đủ 4 bảng chi tiết (Ví, Đối tượng, Danh mục cha, Danh mục con) thông qua việc tra cứu bảng `Category` ở `Tóm tắt_v2`.

## 1. Kiến trúc tổng thể & Luồng dữ liệu

```text
[Tóm tắt_v2] (Master Data: Wallet, userr, Category)
     |
     +--> Dropdown chung cho Log tổng & Log tháng
     |
     +--> Giao dịch_v2 (Log tổng, 10 cột)  --[Giữ nguyên]--> Bao Cao v2 (Hôm nay + 3 tháng)
     |
     +--> Log_MM_YYYY (Log tháng, 9 cột)   --[Mới]---------> BaoCao_MM_YYYY (4 bảng chi tiết)
```

- **Log tổng (`Giao dịch_v2`)**: nguồn an toàn, giữ nguyên cột F, ghi song song trong giai đoạn đầu.
- **Log tháng (`Log_MM_YYYY`)**: tạo tự động theo tháng, 9 cột, chỉ có Danh mục con, không có Danh mục cha.
- **Báo cáo tháng (`BaoCao_MM_YYYY`)**: giá trị tĩnh do script ghi, gồm 4 bảng: Tổng quan tháng, Theo Ví, Theo Đối tượng, Theo Danh mục cha, Theo Danh mục con.
- **Bao Cao v2 & Tóm tắt_v2**: giữ nguyên, vận hành song song bình thường.

## 2. Hai bản đồ cột (bắt buộc)

```javascript
// Log tổng - Giao dịch_v2 (10 cột) - GIỮ NGUYÊN LOG_COL hiện tại
const LOG_COL = { NGAY:0, PHAN_LOAI:1, SO_TIEN:2, VI:3, DOI_TUONG:4,
                  DANH_MUC_CHA:5, DANH_MUC_CON:6, GHI_CHU:7, UNIQUE_KEY:8, STATUS:9 };

// Log tháng - Log_MM_YYYY (9 cột) - MỚI, dồn từ cột F cũ trở đi
const MONTH_LOG_COL = { NGAY:0, PHAN_LOAI:1, SO_TIEN:2, VI:3, DOI_TUONG:4,
                        DANH_MUC_CON:5, GHI_CHU:6, UNIQUE_KEY:7, STATUS:8 };
```

- Không dùng chung `LOG_COL` khi thao tác `Log_MM_YYYY`.
- `UNIQUE_KEY`: Log tổng ở index 8, Log tháng ở index 7.
- Log tháng ghi giá trị tĩnh, không ArrayFormula, không hàm volatile (`TODAY`/`NOW`/`INDIRECT`/`OFFSET`/`RAND`).

## 3. Phân công công việc

### 3.1. Phần việc của User (Google Sheets)

1. Không xóa, đổi tên, sửa cấu trúc các sheet/Named Range hiện có: `Giao dịch_v2`, `Bao Cao v2`, `Tóm tắt_v2`, `Log`, `Wallet`, `userr`, `Category`.
2. Tạo `Template_Log` (GID **192263148**):
   - Copy `Giao dịch_v2`, đổi tên thành `Template_Log`.
   - Chỉ trên `Template_Log`, xóa cột F `Danh mục cha`; tuyệt đối không xóa cột F ở `Giao dịch_v2`.
   - Kiểm tra còn đúng 9 cột: Ngày, Phân loại, Số tiền, Ví, Đối tượng, Danh mục con, Ghi chú, UniqueKey, Status.
   - Xóa dữ liệu giao dịch, nhưng giữ một dòng dummy cuối vùng nhập liệu để giữ format/Data Validation. Dropdown Ví, Đối tượng, Danh mục con tiếp tục lấy từ `Wallet`, `userr`, `Category` trên `Tóm tắt_v2`.
   - Ẩn `Template_Log`.
3. Tạo `Template_BaoCao` (GID **56513848**):
   - Tạo sheet mới tên đúng `Template_BaoCao` và ẩn sau khi hoàn thành.
   - Chuẩn bị 4 vùng chi tiết xếp hàng ngang từ dòng 11: Ví, Đối tượng, Danh mục cha, Danh mục con.
   - Không dùng công thức. Chừa vùng dữ liệu cho script ghi giá trị tĩnh.
4. Báo lại: vị trí vùng dữ liệu, dòng dummy/dòng tổng của hai template trước khi code (Đã xác nhận thành công qua Drive API).
5. Sau khi code: test giao dịch Telegram (text/ảnh/voice), quét mail, và xác nhận các sheet tháng/báo cáo tháng tự sinh đúng.

### 3.2. Phần việc của AI / Code (`Code.gs`)

1. Thêm `MONTH_LOG_COL` và helper thao tác Log tháng 9 cột, không sửa `LOG_COL` hiện có.
2. Viết `getOrCreateMonthSheets(dateStr)`:
   - Chuẩn hóa ngày và tạo `monthKey` dạng `MM_YYYY`.
   - Nhân bản `Template_Log` (GID: 192263148) thành `Log_MM_YYYY` và `Template_BaoCao` (GID: 56513848) thành `BaoCao_MM_YYYY` nếu chưa có.
   - Trả về `{ logSheet, baoCaoSheet, monthKey }`.
3. Refactor `saveBatchToSheet` để ghi song song:
   - Giữ nguyên cơ chế ghi Log tổng 10 cột, gồm nhảy cột F và copy format từ dummy hiện có.
   - Nhóm batch theo tháng phát sinh, ghi Log tháng 9 cột liên tiếp từ Ngày đến Status.
   - Với mỗi tháng được ghi, gọi `rebuildBaoCaoThang(monthKey)`.
   - Gọi `rebuildBaoCao()` hiện có để `Bao Cao v2` tiếp tục đọc Log tổng như cũ.
4. Viết `rebuildBaoCaoThang(monthKey)`, chỉ đọc `Log_MM_YYYY`, tổng hợp 4 bảng và ghi giá trị tĩnh vào `BaoCao_MM_YYYY`.
5. Đồng bộ đọc/sửa/xóa: `readLogRowByUniqueKey`, `getSheetFingerprint`, `updateRowByUniqueKey`, `deleteRowsByUniqueKeys`, `loadDraftFromSheet`.
6. Cập nhật `onEdit`, `getLiveData`, và các chỗ đọc `LOG_COL` để nhận diện đúng loại Log/cột tương ứng.
7. Viết migration script chỉ dùng khi cần chuyển toàn bộ lịch sử sang Log tháng; không chạy tự động trong giai đoạn dual-write.

## 4. Lộ trình triển khai

### Bước 1 — Chuẩn bị template (User)

Điều kiện hoàn thành: có `Template_Log` 9 cột và `Template_BaoCao` 4 vùng, cả hai đã ẩn; Log cũ hoàn toàn không thay đổi. (Đã hoàn thành và xác nhận toạ độ thực tế).

### Bước 2 — Khởi tạo Log tháng và dual-write (AI)

Vị trí chính: `saveBatchToSheet` hiện nằm ở `Code.gs` dòng 1888. Hàm hiện ghi Log tổng bằng hai mảng: 5 cột đầu và 4 cột sau cột F. Sau refactor:

1. Giữ nguyên nhánh ghi cũ vào Named Range `Log`.
2. Tạo mảng 9 cột riêng cho Log tháng.
3. Nhóm giao dịch theo `monthKey` từ `ngay_gd`.
4. Tạo sheet tháng rồi ghi batch tháng, copy format từ dummy của chính sheet đó.
5. Nếu một trong hai nhánh ghi lỗi, trả lỗi rõ ràng; không báo thành công khi dual-write chưa hoàn tất.

Các nguồn Telegram text/ảnh/voice và quét mail đều đã hội tụ tại `saveBatchToSheet`, nên không viết nhánh ghi mới cho từng nguồn.

### Bước 3 — Báo cáo tháng (AI)

`rebuildBaoCaoThang(monthKey)`:

- Đọc duy nhất Log tháng mục tiêu với `MONTH_LOG_COL`.
- Tra cứu bảng `Category` ở sheet `Tóm tắt_v2` để map Danh mục con ra Danh mục cha.
- Tổng quan: Thu, Chi, Lợi nhuận, Số giao dịch, CHECK chưa ghi nhận.
- Bốn bảng chi tiết: theo Ví, Đối tượng, Danh mục cha, Danh mục con; chỉ ghi các mục có phát sinh trong tháng.
- Xóa vùng dữ liệu cũ của cả bốn bảng trước khi ghi lại.
- Không thay đổi `rebuildBaoCao` hiện có: nó vẫn đọc Named Range `Log` 10 cột và ghi `Bao Cao v2`.

### Bước 4 — Đồng bộ sửa/xóa và hàm phụ trợ (AI)

| Hàm | Hiện trạng | Thay đổi |
|---|---|---|
| `readLogRowByUniqueKey` | Đọc Log tổng | Ưu tiên Log tổng khi dual-write; fallback tìm Log tháng đúng cột UniqueKey. |
| `updateRowByUniqueKey` | Cập nhật một dòng Log tổng | Ghi cả Log tổng 10 cột và Log tháng 9 cột; nếu ngày bị đổi tháng, xóa bản ghi tháng cũ, ghi sang Log tháng mới, rebuild cả hai tháng. |
| `deleteRowsByUniqueKeys` | Xóa Log tổng | Xóa trên Log tổng và tất cả Log tháng liên quan, rồi rebuild tháng bị ảnh hưởng. |
| `loadDraftFromSheet` | Đọc Log tổng | Giữ Log tổng là nguồn khôi phục trong giai đoạn dual-write; fallback Log tháng khi cần. |
| `onEdit` | So giao vùng Named Range `Log` | Nhận diện thêm mọi sheet có tên `Log_MM_YYYY`, dùng index Phân loại/Số tiền giống nhau. |
| `getLiveData` | Lấy master data + lịch sử Log tổng | Giữ master data; ưu tiên lịch sử Log tháng hiện tại để giảm dữ liệu gửi AI. |

### Bước 5 — Test giai đoạn song song (User + AI)

1. Ghi giao dịch mới qua Telegram text.
2. Ghi giao dịch từ ảnh/voice.
3. Quét mail.
4. Sửa một giao dịch, bao gồm đổi ngày sang tháng khác.
5. Hoàn tác/xóa một giao dịch.
6. Đối chiếu từng giao dịch: Log tổng có 10 cột, Log tháng có 9 cột cùng dữ liệu nghiệp vụ và cùng `UNIQUE_KEY`.
7. Đối chiếu `Bao Cao v2` với Log tổng; đối chiếu từng `BaoCao_MM_YYYY` với Log tháng tương ứng.

## 5. Giai đoạn cuối — Migration và gỡ nhánh cũ

Chỉ thực hiện sau thời gian vận hành song song và số liệu đã được đối chiếu ổn định.

1. Chạy migration đọc toàn bộ Log tổng, nhóm theo tháng và chỉ bổ sung các `UNIQUE_KEY` chưa có ở `Log_MM_YYYY`.
2. Rebuild toàn bộ `BaoCao_MM_YYYY`.
3. Đối chiếu tổng Thu/Chi/CHECK của các tháng với `Bao Cao v2` và Log tổng.
4. Chuyển `rebuildBaoCao` sang tổng hợp từ các báo cáo/Log tháng.
5. Tắt dual-write; chỉ ghi `Log_MM_YYYY`.
6. Archive (không xóa ngay) `Giao dịch_v2` và Named Range `Log`; chỉ xóa sau một giai đoạn backup an toàn.
7. Xóa nhánh code Log tổng và `LOG_COL` cũ khi không còn sheet nào sử dụng chúng.

## 6. Nguyên tắc an toàn và hiệu năng

- Không phá Named Range `Log` hoặc `LOG_COL` trong giai đoạn song song.
- Không ghi đè cột F của Log tổng; cột này tiếp tục thuộc cơ chế cũ/ArrayFormula.
- Giữ Lock 15 giây, dummy row, và copy format khi ghi lô ở cả hai loại log.
- `BaoCao_MM_YYYY` chỉ có giá trị tĩnh do script ghi bằng `setValues()`.
- Với khoảng 500 dòng/tháng, ghi và rebuild chỉ quét sheet tháng đang phát sinh; không tăng chi phí theo toàn bộ lịch sử.
- Khi số sheet đạt khoảng 150–200, archive các năm cũ sang file khác nếu file bắt đầu mở chậm.
