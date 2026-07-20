# Cho vay / Đi vay — kỳ hạn thủ công, linh hoạt

## Chốt từ bạn

- Kỳ hạn **set tay**, không bắt buộc khuôn cứng.
- Có khoản **không kỳ hạn**: chỉ trả lãi đến khi trả gốc.
- Chu kỳ vẫn linh hoạt: ngày / tuần / tháng (khi có trả theo kỳ).

---

## Mỗi khoản vay — field tối thiểu

| Field | Bắt buộc? | Ví dụ |
|-------|-----------|--------|
| Chiều | Có | Cho vay / Đi vay |
| Đối tượng | Có | A, Bank… |
| Gốc | Có | 10.000.000 |
| Cách trả | Có | `chi_lai` / `goc_lai` / `chi_goc` |
| Chu kỳ | Không* | ngày / tuần / tháng — *bỏ trống nếu không theo kỳ |
| Kỳ hạn | **Không** | set tay: `30 ngày`, `12 tháng`, hoặc **trống = không kỳ hạn** |
| Lãi / kỳ (hoặc %) | Nếu có lãi | 50k/tuần, 1%/tháng… |
| Ngày bắt đầu | Có | |
| Ngày đáo hạn | Không | chỉ điền khi có hạn chót |

**Kỳ hạn trống** = hợp lệ. Nghĩa là: chưa hẹn hết hạn; trả lãi (nếu có) đến khi trả gốc / tất toán tay.

---

## Hai nhánh chính

### A) Có kỳ hạn (set tay)

Bạn điền: `12 tháng` / `30 ngày` / `8 tuần`…

- Có thể dựng lịch kỳ để ước tính **lãi dự kiến** và **còn lại**.
- Đáo hạn / số kỳ do bạn gõ, bot không ép.

### B) Không kỳ hạn (để trống)

Ví dụ: **chỉ trả lãi đến khi trả gốc**.

```text
Gốc        = 10.000.000 (còn nguyên đến lúc trả gốc)
Lãi        = 50.000 / tuần (mỗi lần trả lãi ghi Log)
Kỳ hạn     = (trống)
Còn lại    = gốc chưa trả  +  lãi đã đến hạn chưa trả
             (không cộng “lãi cả đời tương lai” vì không biết bao nhiêu kỳ)
```

Khác khoản có kỳ hạn cố định: **không đoán lãi tương lai vô hạn**.  
“Còn lại” lúc xem = **gốc dư + lãi quá hạn / đến kỳ chưa trả** (nếu có theo dõi kỳ lãi).

---

## “Còn lại” — quy ước rõ

| Tình huống | Hiện “còn lại” thế nào |
|------------|-------------------------|
| Có kỳ hạn + lịch sẵn | Gốc chưa trả + lãi các kỳ **còn trong lịch** (dự kiến) |
| Không kỳ hạn, chỉ lãi | Gốc chưa trả + lãi **đã đến hạn mà chưa trả** (không dự kiến vô hạn) |
| Không lãi | Chỉ gốc chưa trả |

Như vậy `/no` không bị phình số vì “lãi mãi mãi”.

---

## Ví dụ Tele

```text
# Có kỳ hạn (set tay)
cho A vay 3tr góp ngày 30 ngày
vay bank 12tr góp tháng 12 kỳ

# Không kỳ hạn — chỉ lãi đến khi trả gốc
vay B 10tr lãi 50k/tuần không kỳ hạn
# hoặc
vay B 10tr lãi 50k/tuần
```

Tất toán gốc bất kỳ lúc nào: `trả gốc KV-02 10tr` → còn lại lãi Pending (nếu còn) rồi đóng khoản.

---

## Tóm một câu

**Kỳ hạn = field thủ công, để trống được.**  
Có điền thì tính được lãi dự kiến theo lịch; để trống thì chỉ theo dõi gốc + lãi đến hạn, trả lãi đến khi trả gốc.
