# Cho vay / Đi vay — nhìn bằng ví dụ

Quên lý thuyết một lúc. Chỉ cần nhớ:

> **Một khoản vay = một “hợp đồng” trên Sheet.**  
> Mỗi lần đưa/nhận/trả tiền = một dòng trong sổ thu chi (Log), gắn với hợp đồng đó.

---

## Hình dung 2 tờ giấy

```text
┌─────────────────────────┐     ┌──────────────────────────┐
│  KHOẢN VAY (hợp đồng)   │     │  LOG (tiền vào/ra ví)    │
│  “Còn nợ bao nhiêu?”    │ ←── │  “Hôm nay ví thay đổi?”  │
└─────────────────────────┘     └──────────────────────────┘
```

- Muốn biết **còn bao nhiêu** → nhìn **Khoản vay**  
- Muốn biết **ví hôm nay +/− bao nhiêu** → nhìn **Log**

---

## Ví dụ 1 — Cho bạn A vay, không lãi (kiểu A)

### Ngày 1 — Đưa 5.000.000 cho A

Bạn gõ Tele: `cho A vay 5tr không lãi`

**Khoản vay** có 1 dòng:

| ID | Ai | Kiểu | Gốc | Lãi | Đã trả | Còn lại |
|----|----|------|-----|-----|--------|---------|
| KV-01 | A | Không lãi | 5.000.000 | 0 | 0 | **5.000.000** |

**Log** có 1 dòng (tiền ra ví):

| Ngày | Thu/Chi | Tiền | Ví | Đối tượng | Danh mục | Ghi chú |
|------|---------|------|----|-----------|----------|---------|
| 01/07 | Chi | 5.000.000 | Momo | A | Cho vay | KV-01 |

### Ngày 15 — A trả 2.000.000

Bạn gõ: `A trả 2tr KV-01`

**Log** thêm:

| Ngày | Thu/Chi | Tiền | … | Danh mục | Ghi chú |
|------|---------|------|---|----------|---------|
| 15/07 | Thu | 2.000.000 | … | Thu nợ | KV-01 gốc |

**Khoản vay** cập nhật:

| ID | Đã trả | Còn lại |
|----|--------|---------|
| KV-01 | 2.000.000 | **3.000.000** |

Hết. Không lãi → còn lại = gốc chưa trả.

---

## Ví dụ 2 — Bạn đi vay ngân hàng, lãi theo tháng (kiểu B)

Vay **10.000.000**, lãi **100.000/tháng**, 3 tháng, gốc trả cuối.

### Ngày giải ngân — nhận 10tr vào Bank

**Khoản vay:**

| ID | Chiều | Kiểu | Gốc | Lãi/tháng | Số tháng | Tổng lãi dự kiến | Còn lại lúc đầu |
|----|-------|------|-----|-----------|----------|------------------|-----------------|
| KV-02 | Đi vay | Lãi theo kỳ | 10.000.000 | 100.000 | 3 | 300.000 | **10.300.000** |

*(Còn lại = gốc 10tr + 3 tháng lãi chưa trả)*

**Log:** Thu 10.000.000 / Đi vay / KV-02

### Cuối tháng 1 — trả lãi 100k

**Log:** Chi 100.000 / Trả lãi / KV-02  

**Khoản vay sau đó:**

| Đã trả lãi | Còn lại |
|------------|---------|
| 100.000 | **10.200.000** (= 10tr gốc + 2 tháng lãi còn lại) |

### Cuối tháng 2 — trả lãi 100k nữa

Còn lại → **10.100.000**

### Cuối tháng 3 — trả lãi 100k + gốc 10tr

Hai dòng Log (hoặc một lần trả rồi tách): Chi lãi 100k + Chi gốc 10tr  

Còn lại → **0** (tất toán)

---

## Ví dụ 3 — Vay trả góp gốc + lãi từng đợt (kiểu C)

Vay **6.000.000**, **3 kỳ**, mỗi kỳ trả **2.200.000** (trong đó ~2tr gốc + 200k lãi — số liệu minh họa).

**Lịch sẵn trên Khoản vay:**

| Kỳ | Đến hạn | Phải trả | Gồm gốc | Gồm lãi | Đã trả? |
|----|---------|----------|---------|---------|---------|
| 1 | 01/08 | 2.200.000 | 2.000.000 | 200.000 | |
| 2 | 01/09 | 2.200.000 | 2.000.000 | 200.000 | |
| 3 | 01/10 | 2.200.000 | 2.000.000 | 200.000 | |

**Còn lại lúc đầu** = 2.2tr × 3 = **6.600.000**

Bạn gõ: `trả kỳ 1 KV-03 2.2tr`  

→ 1 dòng Log Chi 2.2tr  
→ Đánh dấu kỳ 1 đã trả  
→ **Còn lại = 4.400.000**

---

## Bạn xem gì trên Tele?

```text
/no
```

Bot trả lời kiểu:

```text
Phải thu
• A (KV-01, không lãi): còn 3.000.000

Phải trả
• Bank (KV-02, lãi tháng): còn 10.200.000
  (gốc 10.000.000 + lãi còn 200.000)
• KV-03 trả góp: còn 4.400.000
```

Đó chính là chỗ **“hiện số nợ còn lại (gốc + lãi dự kiến)”**.

---

## Một câu để nhớ

| Câu hỏi | Trả lời ở đâu |
|---------|----------------|
| Ví hôm nay mất/được bao nhiêu? | **Log** |
| Người này / khoản này còn nợ bao nhiêu (kể cả lãi sắp tới)? | **Khoản vay** |

Log không thay được Khoản vay khi có lãi — vì lãi “còn lại” nằm ở **lịch chưa trả**, chưa phải tiền đã chạy.

---

## Nếu vẫn rối — chỉ cần trả lời

Trong 3 ví dụ trên, bạn hay dùng kiểu nào nhất?

- **1** = không lãi (bạn bè)  
- **2** = lãi từng tháng, gốc cuối  
- **3** = trả góp cố định  

Chốt kiểu hay dùng → mình vẽ đúng 1 flow Tele + cột Sheet cho kiểu đó trước, các kiểu kia làm sau.
