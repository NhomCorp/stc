# Demo tab Alias (Map AI)

Tab Sheet dùng để AI map nhanh khi nhập Telegram — **không lấy history Log** (tránh bị mail scan làm bẩn).

## Cách tạo trên Google Sheet

1. Tạo sheet mới tên: `Alias` (hoặc `Map AI`)
2. File → Import → Upload `alias_tab_demo.csv`  
   hoặc copy header + rows dán từ dòng 1
3. (Khuyến nghị) Đặt Named Range `Alias` = vùng dữ liệu `A2:D...` (không gồm header) nếu sau này GAS đọc bằng `getRangeByName`

## Cột

| Cột | Ý nghĩa | Ví dụ |
|-----|---------|--------|
| `tu_khoa` | Nhiều từ khóa, cách nhau bằng `\|` | `cf\|cafe\|cà phê` |
| `vi` | Nguồn tiền / ví (đúng tên trong list Wallet) | `Momo` |
| `doi_tuong` | Đối tượng (đúng tên trong list userr) | `Tôi` |
| `danh_muc_con` | Danh mục con (đúng tên trong list Category) | `Cà phê` |
| `ghi_chu_mau` | Ví dụ câu Telegram (chỉ để bạn nhớ, AI có thể bỏ) | `cf 45k` |

## Cách AI dùng (bản cập nhật sau)

- Đưa các dòng Alias vào prompt (không đưa 20 dòng Log)
- Match `tu_khoa` trong text/caption người gửi
- Map được → điền `vi` / `doi_tuong` / `danh_muc_con`
- Không match → `"Chưa phân loại"` + auto `CHECK` + chỉ nút Sửa

## Lưu ý

- Giá trị `vi`, `doi_tuong`, `danh_muc_con` nên **khớp Exact** dropdown Sheet đang dùng
- Sửa / thêm alias trên tab này = “dạy” bot, không cần đụng code
- Cột danh mục cha: không dùng ở đây (Sheet tự công thức)
