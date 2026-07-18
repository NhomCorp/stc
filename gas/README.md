# GAS — Sổ Thu Chi v2 (hybrid Alias + AI)

## Files
- `Code.gs` — toàn bộ logic bot (Telegram + Gemini + Sheet + Alias)
- `configui.html` — UI cấu hình AI (model / keys / prompt)

## Cách đưa vào Apps Script
1. Mở project GAS gắn với Sheet
2. Copy nội dung `Code.gs` đè file `.gs` hiện tại (hoặc tạo file mới rồi xóa bản cũ)
3. Tạo file HTML tên đúng `configui`, paste `configui.html`
4. Script Properties giữ: `admin_id`, `bot_token`, `spreadsheet_id`, `ai_keys`, `ai_model`, `ai_prompt`
5. Có thể **xóa** property `key_counter` (không còn dùng)
6. Deploy → Manage deployments → **New version** (webhook mới nhận code)

## Alias
- Sheet gid `1498755942`
- Header dòng 1, data từ dòng 2
- Cột: `Keyword | Wallet | Categories | User`
- Wallet / Categories / User được trống bất kỳ
- Hybrid: tín hiệu câu/ảnh > Alias > `"Chưa phân loại"`

## Đã có thêm
- Config UI **mask API key** (••••); Save giữ key cũ nếu ô còn mask
- Prompt tách 2 lớp: UI = cá nhân; `Code.gs` = Alias hybrid + JSON
- Telegram: **mỗi GD một message + nút**; thiếu field → chỉ nút Sửa + auto CHECK; map đủ → Đúng/Sửa; Đúng xóa status trên Sheet

## Chưa làm
- Webhook `secret_token`
- Xóa tay Script Property `key_counter` nếu còn trên project live
