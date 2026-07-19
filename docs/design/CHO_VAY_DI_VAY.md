# Thiết kế ghi chép: Cho vay & Đi vay

Nghiên cứu logic cho **Sổ Thu Chi (STC)** — stack hiện tại: Telegram → Gemini → Google Sheet (Log + Alias).

Liên quan backlog cũ: *“Nhắc nợ / phải thu (cho mượn, ứng)”* — trước đó chưa chốt schema.

---

## 1. Bài toán

Người dùng cần phân biệt 4 dòng tiền liên quan nợ:

| Hành vi | Tiền ví | Ý nghĩa |
|---------|---------|---------|
| **Cho vay** | Ra | Mình đưa tiền cho người khác → tạo **phải thu** |
| **Thu nợ** | Vào | Người kia trả lại → giảm phải thu |
| **Đi vay** | Vào | Mình nhận tiền từ người khác → tạo **phải trả** |
| **Trả nợ** | Ra | Mình trả lại → giảm phải trả |

Hiện tại Log chỉ có `phan_loai ∈ {Thu, Chi}` — không đủ để vừa giữ sổ tiền mặt vừa theo dõi dư nợ nếu không có quy ước danh mục / sổ riêng.

---

## 2. Nguyên tắc chốt (khuyến nghị)

1. **Cashflow trước, công nợ sau.** Mỗi lần tiền vào/ra ví vẫn ghi 1 dòng Log (Thu/Chi). Không “ẩn” giao dịch vay khỏi Log.
2. **Không thêm giá trị mới vào cột `PHAN_LOAI` ở phase 1.** Giữ `Thu`/`Chi` để không vỡ `onEdit` dấu âm, prompt, report cũ.
3. **Nhận diện nợ bằng danh mục con** (và Alias keyword), không bằng đoán tự do từ AI.
4. **Đối tượng bắt buộc** với 4 loại vay/nợ. Không đối tượng → `CHECK`.
5. **Báo cáo chi tiêu / thu nhập “thật” loại trừ 4 danh mục nợ** (hoặc tách nhóm riêng).
6. **Dư nợ = tổng theo đối tượng**, không lưu số dư cứng trên từng dòng Log.

---

## 3. Mapping ghi chép (phase 1 — chỉ Log + Alias)

### 3.1 Quy ước Thu/Chi + danh mục

| Hành vi | `phan_loai` | `danh_muc_con` | `doi_tuong` | Ví dụ Telegram |
|---------|-------------|----------------|-------------|----------------|
| Cho vay | **Chi** | `Cho vay` | Người nhận tiền | `cho A vay 500k momo` |
| Thu nợ | **Thu** | `Thu nợ` | Cùng người đã vay | `A trả 200k bank` |
| Đi vay | **Thu** | `Đi vay` | Người cho mình vay | `vay B 1tr bank` |
| Trả nợ | **Chi** | `Trả nợ` | Cùng người đã cho vay | `trả B 300k` |

Danh mục cha: **để Sheet công thức** (như quy ước hiện tại) — gợi ý nhóm cha `Công nợ` hoặc `Vay mượn`.

### 3.2 Công thức dư nợ theo người

```text
Phải thu(A) = Σ Cho vay(A) − Σ Thu nợ(A)
Phải trả(B) = Σ Đi vay(B) − Σ Trả nợ(B)
```

- `Phải thu > 0` → A còn nợ mình  
- `Phải trả > 0` → mình còn nợ B  
- Âm → lệch ghi chép (thu/trả vượt gốc) → nên `CHECK` hoặc cảnh báo trên tab công nợ

### 3.3 Alias mẫu (bổ sung tab Alias)

| Keyword | Wallet | Categories | User |
|---------|--------|------------|------|
| cho vay\|cho mượn\|ứng | | Cho vay | |
| thu nợ\|trả lại\|trả mình | | Thu nợ | |
| vay\|đi vay\|mượn | | Đi vay | |
| trả nợ\|trả góp nợ | | Trả nợ | |

- `User` thường để trống ở keyword chung → AI/Alias lấy tên người từ câu (`cho Minh Nghĩa vay…`).
- Keyword gắn người cụ thể vẫn ưu tiên hơn (vd. `Minh Nghĩa` → User sẵn).

### 3.4 Rule prompt AI (bổ sung)

```text
- "cho X vay / cho X mượn / ứng X" → Chi + danh_muc_con = Cho vay + doi_tuong = X
- "X trả / thu nợ X / X trả lại" → Thu + Thu nợ + doi_tuong = X
- "vay X / mượn X / X cho vay" → Thu + Đi vay + doi_tuong = X
- "trả X / trả nợ X" → Chi + Trả nợ + doi_tuong = X
- Phân biệt với chuyển nội bộ (cùng chủ sở hữu các ví) và ck gia đình không phải vay.
- Nếu nghi là vay/nợ nhưng thiếu tên người → doi_tuong = "Chưa phân loại" (bắt buộc CHECK).
```

Ưu tiên hybrid giữ nguyên: **tín hiệu câu/ảnh > Alias > "Chưa phân loại"**.

---

## 4. Ảnh hưởng báo cáo

Nếu không tách, “Cho vay” làm **phình chi tiêu**, “Đi vay” làm **phình thu nhập**.

| Chỉ số | Cách tính |
|--------|-----------|
| Chi tiêu thật | Σ Chi − Cho vay − Trả nợ |
| Thu nhập thật | Σ Thu − Đi vay − Thu nợ |
| Tiền ra ví (cash out) | Σ Chi (giữ nguyên) |
| Tiền vào ví (cash in) | Σ Thu (giữ nguyên) |
| Tổng phải thu | Σ (Cho vay − Thu nợ) theo từng đối tượng, chỉ số dương |
| Tổng phải trả | Σ (Đi vay − Trả nợ) theo từng đối tượng, chỉ số dương |

Tab `Bao Cao` / lệnh `/report`: thêm 2 dòng **Phải thu / Phải trả** (phase 1 có thể QUERY trên Sheet, chưa cần code GAS).

---

## 5. Phase 2 — Tab `Cong No` (khi dùng nhiều)

Không bắt buộc ngay. Khi số người / lần trả nhiều, thêm sheet:

| Cột | Ý nghĩa |
|-----|---------|
| Đối tượng | Tên (khớp Log.`DOI_TUONG`) |
| Loại | `Phải thu` / `Phải trả` |
| Gốc | Tổng cho vay hoặc đi vay |
| Đã thanh toán | Tổng thu nợ hoặc trả nợ |
| Còn lại | Gốc − Đã thanh toán |
| Hạn | Optional (ngày hẹn) |
| Ghi chú | Optional |
| Status | `Đang mở` / `Tất toán` / `Lệch` |

Nguồn: `QUERY`/`SUMIF` từ Log theo 4 danh mục — **không ghi tay số dư** để tránh lệch với Log.

Nhắc nợ (Tele): đọc các dòng `Còn lại > 0` + có `Hạn` ≤ hôm nay → gửi message. Đây là phần “Nhắc nợ / phải thu” trong backlog.

---

## 6. Phân biệt với các dòng tiền gần giống

| Tình huống | Ghi thế nào | Không ghi là |
|------------|-------------|--------------|
| Chuyển Momo → Bank (cùng mình) | Phase riêng: chuyển nội bộ (chưa làm) | Cho vay / Đi vay |
| CK cho bố mẹ (cho luôn, không đòi) | Chi + danh mục gia đình / hỗ trợ | Cho vay |
| Bạn trả hộ bill, mình hoàn lại | Chi bình thường (hoàn) hoặc Cho vay nếu đang ứng | Tùy ý định “có đòi lại không” |
| Ứng lương / tạm ứng công ty | Cho vay (phải thu) hoặc danh mục riêng nếu muốn tách | Đi vay |

**Rule thực dụng:** chỉ gọi là vay khi **có ý định hoàn lại**. Cho luôn → Chi thường.

---

## 7. Luồng Telegram (phase 1)

1. User: `cho A vay 500k momo`
2. AI + Alias → Chi / 500000 / Momo / A / Cho vay
3. Gửi 1 message check như GD thường
4. Thiếu đối tượng hoặc danh mục nợ không khớp 4 loại khi text có tín hiệu vay → auto `CHECK`
5. Không mở sổ nợ riêng trên Tele ở phase 1; xem dư nợ bằng Sheet hoặc lệnh sau (`/no`)

Gợi ý lệnh sau (phase 2):

```text
/no          → tổng phải thu / phải trả
/no A        → lịch sử + còn lại với A
```

---

## 8. Việc cần làm trên Sheet trước khi code

1. Thêm 4 danh mục con vào list Category (dropdown): `Cho vay`, `Thu nợ`, `Đi vay`, `Trả nợ`
2. (Khuyến nghị) gán danh mục cha `Công nợ` bằng công thức hiện có
3. Thêm 4 dòng Alias keyword (mục 3.3)
4. (Optional) vùng báo cáo QUERY phải thu / phải trả theo đối tượng

---

## 9. Việc cần làm trong GAS (khi chốt triển khai)

1. Bổ sung rule vào prompt hệ thống (mục 3.4)
2. Validate: nếu `danh_muc_con` ∈ 4 loại nợ và `doi_tuong` trống/`Chưa phân loại` → bắt buộc `CHECK`
3. Report: loại 4 danh mục khỏi “chi tiêu/thu nhập thật”; thêm dòng công nợ
4. Chưa đụng `PHAN_LOAI`, chưa thêm cột Log mới ở phase 1

---

## 10. Lựa chọn đã loại (và vì sao)

| Phương án | Lý do không chọn ngay |
|-----------|------------------------|
| Thêm `phan_loai = Cho vay/Đi vay/...` | Phá `onEdit`, prompt, mọi chỗ giả định Thu/Chi |
| Ví ảo “Phải thu / Phải trả” | Mạnh về kế toán, nặng UX + Alias + report; để phase app/DB sau |
| Chỉ ghi chú trong `ghi_chu`, không danh mục | Không aggregate được dư nợ |
| Sổ nợ tách, không ghi Log | Mất dòng tiền ví, lệch với cách dùng bot hiện tại |

---

## 11. Quyết định cần user chốt

- [ ] Phase 1 theo **danh mục 4 loại** như trên?
- [ ] Tên danh mục giữ đúng: `Cho vay` / `Thu nợ` / `Đi vay` / `Trả nợ`?
- [ ] CK gia đình mặc định **không** phải cho vay (đúng như mục 6)?
- [ ] Có làm tab `Cong No` + `/no` ngay, hay chỉ Log trước?

Khi chốt 4 ý trên → triển khai Alias + prompt + (optional) report.
