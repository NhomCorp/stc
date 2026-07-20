# Cho vay / Đi vay — kỳ hạn linh hoạt

## Trả lời ngắn

**Có — kỳ hạn linh hoạt.**  
“Ngày / tuần / tháng” chỉ là **chu kỳ trả**, không khóa cứng một kiểu vay.

Hai thứ tách nhau:

| Trục | Giá trị | Ý nghĩa |
|------|---------|---------|
| **Chu kỳ** | ngày / tuần / tháng /(tùy chọn) | Bao lâu trả một lần |
| **Cách trả mỗi kỳ** | chỉ lãi · gốc+lãi · chỉ gốc | Kỳ đó trả cái gì |

Ghép lại ra đúng 3 kiểu bạn nói (và còn mở thêm được).

---

## 3 kiểu bạn nêu

### 1) Góp ngày — gốc + lãi

Mỗi **ngày** trả một phần **gốc + lãi**.

```text
KV-01 | Cho vay A | chu kỳ: ngày | cách trả: gốc+lãi
Gốc 3.000.000 | 30 ngày | ~100k gốc + lãi/ngày (minh họa)
Còn lại lúc đầu = tổng các ngày chưa trả
Ngày 1 trả xong → còn lại giảm 1 ngày
```

### 2) Tuần trả lãi — gốc còn nguyên

Mỗi **tuần** chỉ trả **lãi**; **gốc giữ nguyên** đến lúc tất toán (trả gốc cuối hoặc khi hết hạn).

```text
KV-02 | Đi vay | chu kỳ: tuần | cách trả: chỉ lãi
Gốc 10.000.000 | lãi 50.000/tuần
Còn lại = gốc 10tr + (số tuần lãi chưa trả × 50k)
Tuần 1 trả 50k lãi → gốc vẫn 10tr, lãi còn lại giảm 1 tuần
```

### 3) Tháng — gốc + lãi

Mỗi **tháng** trả **gốc + lãi** (trả góp tháng).

```text
KV-03 | Đi vay | chu kỳ: tháng | cách trả: gốc+lãi
Gốc 12.000.000 | 12 tháng | mỗi tháng ~1.1tr (gốc+lãi)
Trả 3 tháng → còn lại ≈ 9 tháng chưa trả
```

---

## Bảng ghép (để khỏi nhầm)

| | Chỉ lãi (gốc nguyên) | Gốc + lãi mỗi kỳ | Chỉ gốc (không lãi) |
|--|----------------------|------------------|---------------------|
| **Ngày** | ít gặp | **góp ngày gốc lãi** ← bạn | ứng ngày không lãi |
| **Tuần** | **tuần trả lãi** ← bạn | góp tuần gốc+lãi | |
| **Tháng** | tháng chỉ trả lãi | **tháng gốc lãi** ← bạn | |

Cột Sheet trên khoản vay chỉ cần 2 field:

- `chu_ky` = `ngày` | `tuần` | `tháng`
- `cach_tra` = `chi_lai` | `goc_lai` | `chi_goc`

Không cần “hard-code” 3 sản phẩm riêng — cùng một khuôn, đổi 2 field.

---

## Còn lại vẫn cùng một công thức

```text
Còn lại = gốc chưa trả  +  lãi các kỳ chưa trả (theo lịch)
```

- **Chỉ lãi:** gốc thường = đủ đến khi trả gốc; còn lại giảm chủ yếu ở phần lãi từng kỳ  
- **Gốc+lãi:** mỗi kỳ trả xong là giảm cả gốc lẫn lãi của kỳ đó  
- **Chỉ gốc:** còn lại = gốc chưa trả

---

## Log vẫn đơn giản

Mỗi lần trả thật → 1 (hoặc 2) dòng Log gắn `KV-xx`.  
Số **còn lại** chỉ đổi trên tab Khoản vay / lịch kỳ.

---

## Ví dụ Tele (cùng khuôn)

```text
cho A vay 3tr góp ngày 30 ngày
vay B 10tr lãi 50k/tuần gốc cuối
vay bank 12tr góp tháng 12 kỳ
```

Bot tạo khoản với `chu_ky` + `cach_tra` tương ứng; `/no` hiện còn lại.

---

## Chốt lại

1. Kỳ hạn **linh hoạt**: ngày / tuần / tháng (sau này thêm tùy chọn cũng được).  
2. Ba kiểu bạn nêu = 3 tổ hợp của `chu_ky` × `cach_tra`, không phải 3 hệ thống riêng.  
3. Muốn thêm “tháng chỉ lãi” hoặc “tuần gốc+lãi” → chỉ thêm tổ hợp, không đổi kiến trúc.

Bạn có cần **số kỳ cố định sẵn** (30 ngày / 12 tháng), hay cũng có khoản **không biết trước bao nhiêu kỳ** (trả lãi đến khi trả gốc)?
