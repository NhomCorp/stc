---
name: compact
description: Compact or summarize conversation history to reduce context window usage when requested via /compact or when context grows large. Use when the user requests a chat summary, context reduction, or mentions "/compact".
disable-model-invocation: false
---

# Compact Chat Context

Use this skill to condense active conversation history, capturing key decisions, technical discoveries, code changes, and current pending goals into a hyper-focused summary to minimize token usage and prevent context dilution.

## Triggering Situations

- The user explicitly types `/compact` or asks to "tóm tắt hội thoại", "giảm context", "nén chat".
- The conversation history becomes extremely long, slowing down responses or approaching model limits, and the agent needs a clean slate without losing critical history.

## Steps to Compact

When this skill is triggered, you must perform the following actions:

1. **Analyze the Conversation History**: Review all prior user messages, tool calls, and assistant responses. Identify the core objectives, decisions made, issues resolved, current codebase changes, and pending tasks.
2. **Generate the Compact Summary**: Produce a structured, highly dense summary following the template below.
3. **Draft the `.compact.md` (Optional/Project Scope)**: If working on a complex project-wide task, write this summary to `.cursor/compact.md` to persist the state across future chats, then notify the user.

## Compact Summary Template

Your response must be formatted as follows:

```markdown
# 📉 CONTEXT COMPACTED (Tóm tắt thu gọn Context)

> **Mục tiêu**: Giảm bớt gánh nặng token cho context window nhưng vẫn giữ lại toàn bộ các logic, quyết định kỹ thuật và trạng thái hiện tại của dự án.

## 🎯 Current Status & Goal (Trạng thái & Mục tiêu hiện tại)
- **Mục tiêu chính**: [Tóm tắt ngắn gọn mục tiêu tổng thể của cuộc trò chuyện]
- **Trạng thái hiện tại**: [Mô tả ngắn gọn tiến độ hiện tại, việc gì đang làm dở]

## 🛠️ Key Decisions & Technical Context (Quyết định & Bối cảnh kỹ thuật)
- **Kiến trúc/Giải pháp**: [Các lựa chọn công nghệ, thuật toán, hoặc hướng đi đã chốt]
- **File quan trọng**: [Danh sách file chính kèm mục đích sử dụng trong phiên làm việc này]
- **Ràng buộc/Lưu ý**: [Các luật, quy ước viết code của dự án, hoặc các hạn chế cần tuân thủ]

## 📝 Completed Work (Các công việc đã hoàn thành)
- [x] [Việc 1] (Chi tiết ngắn gọn, ví dụ: "Đã cài đặt API Gateway ở `server.js`")
- [x] [Việc 2]

## ⏳ Next Steps & Open Questions (Bước tiếp theo & Câu hỏi mở)
- [ ] [Việc kế tiếp cần thực hiện ngay]
- [ ] [Câu hỏi hoặc vấn đề chưa giải quyết cần làm rõ với người dùng]
```

## Anti-Patterns

- **Do not lose path names or specific configurations**: Always preserve exact file paths (e.g. `src/components/Button.tsx`) and configuration details.
- **Do not write long paragraphs**: Use bullet points and highly concise, technical phrasing.
- **Do not omit rules**: If the user specified strict project constraints (e.g. "Do not use external libraries"), ensure those are captured in the "Ràng buộc/Lưu ý" section.
