# Tab Alias — schema thật trên Sheet

- Sheet chứa Alias: `gid=1498755942`
- Data bắt đầu **dòng 2** (dòng 1 = header)
- Dropdown ở cột Wallet / Categories / User

## Cột (trái → phải)

| Cot | Header | Ý nghĩa | Bắt buộc? |
|-----|--------|---------|-----------|
| A | `Keyword` | Từ khóa / cụm match trong text Telegram | Có |
| B | `Wallet` | Nguồn tiền mặc định | Không — **để trống được** |
| C | `Categories` | Danh mục con | Khuyến nghị |
| D | `User` | Đối tượng | Khuyến nghị |

Ví dụ đang có:

| Keyword | Wallet | Categories | User |
|---------|--------|------------|------|
| ăn sáng | *(trống)* | Ăn sáng | Bản thân |
| ăn trưa | *(trống)* | Ăn trưa | Bản thân |
| Minh Nghĩa | Bank | ADS | Minh Nghĩa |

## Hybrid (đã chốt)

```text
Tín hiệu trong câu/ảnh  >  Alias  >  "Chưa phân loại"
```

- Match Keyword → lấy Categories / User / Wallet (nếu có) làm **default**
- Wallet trống trong Alias → AI tự đọc ngữ cảnh; không có tín hiệu → `"Chưa phân loại"` + bắt buộc sửa
- Có tín hiệu ví trong câu (bank, momo, tm…) → AI **ghi đè** Wallet Alias
- Không dùng history Log 20 dòng

Ví dụ:
- `ăn sáng 40k` → Category Ăn sáng, User Bản thân, Wallet chưa rõ → check
- `ăn sáng 40k momo` → giữ Category/User, Wallet = Momo (AI ghi đè)
- `Minh Nghĩa 500k` → Wallet Bank, Category ADS, User Minh Nghĩa

## GAS đọc sau này

```text
Sheet theo gid 1498755942
Range: A2:D (bỏ hàng trống Keyword)
Không phụ thuộc tên cột tiếng Việt trong demo cũ
```

Named Range (optional): đặt `Alias` = `A2:D` trên đúng sheet đó.

## Note cập nhật sau

- Xóa Script Property `key_counter`
- Danh mục cha: không đụng (Sheet công thức)
