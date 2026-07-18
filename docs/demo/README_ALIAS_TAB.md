# Demo tab Alias — hybrid AI + Alias

Một tab `Alias` dạng rộng (đúng như bạn chốt).  
**Alias = gợi ý mặc định theo thói quen. AI đọc ngữ cảnh và được ghi đè.**

## Cấu trúc tab (1 sheet)

| tu_khoa | vi | doi_tuong | danh_muc_con | ghi_chu_mau |
|---------|----|----------|--------------|-------------|
| cf\|cafe\|cà phê\|coffee | Tiền mặt | Tôi | Cà phê | cf 45k |
| xăng\|đổ xăng\|petrol | Tiền mặt | Tôi | Xăng xe | xăng 200k |
| grab\|be\|xanh sm\|gojek | Momo | Tôi | Di chuyển | grab 80k |
| lương\|salary\|nhận lương | Ngân hàng | Công ty | Lương | nhận lương 15tr |

File mẫu: `alias_tab_demo.csv`

## Luật hybrid (quan trọng)

1. **Match Alias** theo `tu_khoa` trong text/caption (hoặc text OCR từ ảnh).
2. **Alias chỉ là default** cho `vi` / `doi_tuong` / `danh_muc_con`.
3. **AI đọc ngữ cảnh** — nếu câu có tín hiệu khác thì **ghi đè Alias**:
   - `xăng 200k` → DM Xăng xe, ví Tiền mặt (theo Alias)
   - `xăng 200k bank` → DM Xăng xe, ví **Ngân hàng** (AI ghi đè, không kẹt Tiền mặt)
   - `grab công ty 80k` → DM Di chuyển, đối tượng **Công ty** nếu có trong list
4. Field AI + Alias vẫn không chắc → `"Chưa phân loại"` + **bắt buộc sửa** (auto `CHECK`, không hỏi có cần check không).
5. Map đủ field vẫn có **nút check từng GD** (vì có thể map sai).
6. **Không dùng 20 dòng Log history** làm thói quen (mail scan dễ chen).

## Thứ tự ưu tiên khi điền field

```text
Tín hiệu rõ trong câu/ảnh  >  Alias match  >  "Chưa phân loại"
```

List hợp lệ vẫn lấy từ Sheet: Wallet / userr / Category (đúng tên dropdown).

## Cách tạo trên Google Sheet

1. Tạo sheet tên `Alias`
2. Import `alias_tab_demo.csv` hoặc copy/paste
3. Đổi `vi` / `doi_tuong` / `danh_muc_con` cho **khớp Exact** dropdown đang dùng
4. (Sau) Named Range `Alias` = vùng data không gồm header — GAS đọc đưa vào prompt

## Việc GAS sẽ làm (bản code sau)

- `getLiveData()` thêm đọc tab `Alias` (không inject history Log)
- Prompt Gemini nhận: list ví/DM/đối tượng + bảng Alias + luật ghi đè ngữ cảnh
- Telegram: mỗi GD một nút check; thiếu field → chỉ nút Sửa

## Lưu ý

- `ghi_chu_mau` chủ yếu để bạn nhớ / few-shot; có thể không bắt buộc đưa hết vào prompt
- Danh mục cha: không đụng — Sheet tự công thức
- Bản cập nhật tiếp: xóa Script Property `key_counter` (không dùng)
