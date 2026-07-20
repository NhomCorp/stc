# Mô hình Cho vay / Đi vay (STC)

Phiên bản đã chốt qua bàn luận: kỳ hạn thủ công linh hoạt; có khoản không kỳ hạn (chỉ lãi đến khi trả gốc).

---

## 1. Tổng quan

Hai lớp dữ liệu:

```text
┌──────────────────────────────────────┐
│  KHOẢN VAY                           │
│  Hợp đồng: gốc, lãi, chu kỳ, kỳ hạn  │
│  → trả lời: còn nợ bao nhiêu?        │
└──────────────────▲───────────────────┘
                   │ gắn bằng ID (KV-xx)
┌──────────────────┴───────────────────┐
│  LOG THU CHI                         │
│  Mỗi lần tiền thật vào/ra ví         │
│  → trả lời: ví hôm nay đổi gì?       │
└──────────────────────────────────────┘
```

- **Cho vay** và **đi vay** dùng cùng mô hình; khác ở field `chieu`.
- Không thêm loại mới vào cột Thu/Chi của Log (vẫn `Thu` / `Chi`).

---

## 2. Thực thể: Khoản vay

Một dòng = một hợp đồng.

| Field | Bắt buộc | Mô tả |
|-------|----------|--------|
| `id` | Có | `KV-001`… |
| `chieu` | Có | `cho_vay` (phải thu) / `di_vay` (phải trả) |
| `doi_tuong` | Có | Người / tổ chức |
| `goc` | Có | Số gốc ban đầu |
| `lai_suat` hoặc `lai_moi_ky` | Nếu có lãi | % hoặc số tiền cố định mỗi kỳ |
| `cach_tra` | Có | `chi_goc` · `chi_lai` · `goc_lai` |
| `chu_ky` | Không | `ngay` · `tuan` · `thang` (trống nếu không theo kỳ) |
| `ky_han` | Không | Set **thủ công**: `30 ngày`, `12 tháng`… — **trống = không kỳ hạn** |
| `ngay_bat_dau` | Có | |
| `ngay_dao_han` | Không | Chỉ khi có hạn chót |
| `status` | Có | `dang_mo` / `tat_toan` |

### Cách trả (`cach_tra`)

| Giá trị | Ý nghĩa |
|---------|---------|
| `chi_goc` | Không lãi; trả gốc (1 lần hoặc nhiều lần) |
| `chi_lai` | Mỗi kỳ (nếu có) chỉ trả lãi; gốc nguyên đến khi trả gốc / tất toán |
| `goc_lai` | Mỗi kỳ trả gốc + lãi |

### Kỳ hạn

- **Có điền** → có thể dựng lịch kỳ → ước tính lãi dự kiến.  
- **Để trống** → không kỳ hạn (vd. trả lãi đến khi trả gốc); không dự kiến lãi vô hạn.

---

## 3. Thực thể: Lịch kỳ (optional)

Dùng khi có `chu_ky` và (thường) có `ky_han`.

| Field | Mô tả |
|-------|--------|
| `khoan_vay_id` | KV-xx |
| `ky_so` | 1, 2, 3… |
| `den_han` | Ngày đến hạn kỳ đó |
| `goc_ky` | Phần gốc của kỳ (0 nếu `chi_lai`) |
| `lai_ky` | Phần lãi của kỳ (0 nếu `chi_goc`) |
| `da_tra` | true/false hoặc số đã trả |
| `ngay_tra` | |

Khoản **không kỳ hạn**: có thể không tạo lịch sẵn; mỗi lần trả lãi/gốc ghi Log (+ optional dòng phát sinh lãi đến hạn nếu cần nhắc).

---

## 4. Log thu chi (giữ schema hiện tại)

Cột Log như cũ: Ngày · Thu/Chi · Số tiền · Ví · Đối tượng · DM cha · DM con · Ghi chú · Unique key · Status.

Gợi ý danh mục con:

| Việc | Thu/Chi | Danh mục gợi ý | Ghi chú |
|------|---------|----------------|---------|
| Giải ngân cho vay | Chi | Cho vay | `KV-001 giải ngân` |
| Nhận đi vay | Thu | Đi vay | `KV-002 giải ngân` |
| Thu/trả gốc | Thu hoặc Chi | Thu nợ gốc / Trả nợ gốc | `KV-001 gốc` |
| Thu/trả lãi | Thu hoặc Chi | Thu lãi / Trả lãi | `KV-001 lãi` |
| Trả góp (gốc+lãi một lần) | Thu hoặc Chi | Thu nợ / Trả nợ | `KV-003 kỳ 2` — tách gốc/lãi trên khoản vay nếu cần |

`doi_tuong` trên Log nên khớp đối tượng khoản vay.

---

## 5. Công thức “còn lại”

```text
goc_con = goc − tổng đã trả gốc (từ Log gắn KV)

lai_con =
  • Có kỳ hạn + lịch:  Σ lãi các kỳ chưa trả trong lịch   (dự kiến)
  • Không kỳ hạn:      Σ lãi đã đến hạn mà chưa trả         (không dự kiến vô hạn)
  • Không lãi:         0

con_lai = goc_con + lai_con
```

`/no` hoặc tab Khoản vay hiện `con_lai` (và có thể tách gốc / lãi cho dễ đọc).

---

## 6. Luồng nghiệp vụ

### Mở khoản

1. User mô tả trên Tele (hoặc nhập Sheet).  
2. Tạo 1 dòng **Khoản vay**.  
3. Nếu có tiền giải ngân ngay → 1 dòng **Log** (Chi nếu cho vay, Thu nếu đi vay).  
4. Nếu có kỳ hạn → (optional) sinh **lịch kỳ**.

### Trả lãi / gốc / góp

1. User ghi nhận lần trả trên Tele.  
2. Ghi **Log** (tiền ví).  
3. Cập nhật đã trả trên khoản vay / lịch kỳ.  
4. `con_lai` giảm; nếu gốc+lãi hết và không còn lãi đến hạn → có thể `tat_toan`.

### Xem nợ

- `/no` → danh sách khoản đang mở + còn lại.  
- `/no A` → lọc theo đối tượng.

---

## 7. Ví dụ tổ hợp thực tế

| Mô tả | chieu | cach_tra | chu_ky | ky_han |
|-------|-------|----------|--------|--------|
| Cho bạn vay không lãi, trả dần | cho_vay | chi_goc | (trống hoặc tùy) | trống hoặc set tay |
| Góp ngày gốc + lãi, 30 ngày | cho_vay / di_vay | goc_lai | ngay | 30 ngày |
| Tuần trả lãi, gốc nguyên, không biết khi nào trả gốc | di_vay | chi_lai | tuan | **trống** |
| Tháng gốc + lãi, 12 kỳ | di_vay | goc_lai | thang | 12 tháng |

---

## 8. Ranh giới với thu chi thường

| Tình huống | Xử lý |
|------------|--------|
| CK cho người thân, không đòi lại | Chi thường — **không** mở khoản vay |
| Chuyển ví nội bộ (Momo↔Bank) | Ngoài mô hình này (chuyển nội bộ — làm sau) |
| Có ý định hoàn lại / trả lãi | Mở **Khoản vay** |

---

## 9. Phase triển khai gợi ý

1. **Sheet:** tab `Khoan Vay` (+ optional `Lich Ky`) + 4–6 danh mục Log.  
2. **GAS/Tele:** tạo khoản, ghi Log gắn ID, lệnh `/no`.  
3. **Sau:** nhắc đến hạn, sửa kỳ hạn tay, tất toán.

Chưa yêu cầu đổi cột `PHAN_LOAI` của Log hiện tại.
