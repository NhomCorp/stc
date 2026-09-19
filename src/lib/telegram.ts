import { getTelegramConfig } from "@/lib/telegram-config";

const getBotToken = async () => {
  const config = await getTelegramConfig();
  return config.token || process.env.TELEGRAM_BOT_TOKEN || "";
};

export async function sendMessage(chatId: string | number, text: string, options: any = {}) {
  const token = await getBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...options,
      }),
    });
    return res.json();
  } catch (error) {
    console.error("Telegram sendMessage error:", error);
    return null;
  }
}

export async function editMessage(chatId: string | number, messageId: number, text: string, options: any = {}) {
  const token = await getBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        ...options,
      }),
    });
    return res.json();
  } catch (error) {
    console.error("Telegram editMessage error:", error);
    return null;
  }
}

export async function deleteMessage(chatId: string | number, messageId: number) {
  const token = await getBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
      }),
    });
    return res.json();
  } catch (error) {
    console.error("Telegram deleteMessage error:", error);
    return null;
  }
}

export async function getFile(fileId: string) {
  const token = await getBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const data: any = await res.json();
    if (!data.ok) return null;

    const filePath = data.result.file_path;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    const buffer = await fileRes.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch (error) {
    console.error("Telegram getFile error:", error);
    return null;
  }
}
