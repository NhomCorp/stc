import { NextRequest, NextResponse } from "next/server";
import { sendMessage, editMessage, getFile } from "@/lib/telegram";
import { callGeminiAPI, transcribeVoiceGemini } from "@/lib/ai-parser";
import { db } from "@/db";
import { transactions, wallets, customers, categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { getTelegramConfig } from "@/lib/telegram-config";

async function processTelegramCallback(cq: any, config: any) {
  const chatId = cq.message?.chat?.id;
  if (config.adminId && String(chatId) !== String(config.adminId)) return;

  const data = cq.data || "";
  const messageId = cq.message?.message_id;

  if (data.startsWith("CONFIRM_")) {
    const txIds = data.replace("CONFIRM_", "").split(",").map(Number);
    await db.update(transactions).set({ status: "valid" }).where(inArray(transactions.id, txIds));
    await editMessage(chatId, messageId, cq.message.text.replace("⚠️ CẦN XÁC NHẬN", "✅ Đã ghi sổ"), { reply_markup: { inline_keyboard: [] } });
  } else if (data.startsWith("CANCEL_")) {
    const txIds = data.replace("CANCEL_", "").split(",").map(Number);
    await db.delete(transactions).where(inArray(transactions.id, txIds));
    await editMessage(chatId, messageId, "❌ Đã hủy giao dịch.", { reply_markup: { inline_keyboard: [] } });
  } else if (data.startsWith("UNDO_")) {
    const txIds = data.replace("UNDO_", "").split(",").map(Number);
    await db.delete(transactions).where(inArray(transactions.id, txIds));
    await editMessage(chatId, messageId, "↩️ Đã hoàn tác (xóa) giao dịch.", { reply_markup: { inline_keyboard: [] } });
  }
}

async function processTelegramMessage(message: any, config: any) {
  const chatId = message.chat.id;
  if (config.adminId && String(chatId) !== String(config.adminId)) return;

  let text = message.text || message.caption || "";
  let base64Image: string | undefined = undefined;

  if (message.voice) {
    const voiceFile = await getFile(message.voice.file_id);
    if (voiceFile) {
      const transcribeResult = await transcribeVoiceGemini(voiceFile, message.voice.mime_type || "audio/ogg");
      if (transcribeResult.error) {
        await sendMessage(chatId, `❌ Lỗi nghe giọng nói: ${transcribeResult.error}`);
        return;
      }
      text = transcribeResult.text || "";
    }
  }

  if (message.photo && message.photo.length > 0) {
    const highestResPhoto = message.photo[message.photo.length - 1];
    const base64 = await getFile(highestResPhoto.file_id);
    if (base64) base64Image = base64;
  }

  if (!text && !base64Image) return;

  // Thông báo chờ
  const pendingMsg = await sendMessage(chatId, "🧠 Đang phân tích giao dịch qua Gemini AI...");
  const pendingMsgId = pendingMsg?.result?.message_id;

  try {
    // AI Phân tích
    const parseResult = await callGeminiAPI(text, base64Image);
    if (parseResult.error) {
      if (pendingMsgId) await editMessage(chatId, pendingMsgId, `❌ Lỗi AI: ${parseResult.error}`);
      return;
    }

    const txList = parseResult.giao_dich || [];
    if (txList.length === 0) {
      if (pendingMsgId) await editMessage(chatId, pendingMsgId, "⚠️ Không tìm thấy giao dịch nào hợp lệ trong tin nhắn.");
      return;
    }

    // Load Master Data
    const [allWallets, allCustomers, allCategories] = await Promise.all([
      db.select().from(wallets),
      db.select().from(customers),
      db.select().from(categories),
    ]);

    const createdTxs = [];
    let hasCheck = false;
    let replyMsg = "";

    for (const item of txList) {
      let isUnknown = false;
      const phanLoai = (item.phan_loai || "").toLowerCase();
      let type = phanLoai.includes("thu") ? "thu" : "chi";
      
      if (phanLoai.includes("không rõ") || phanLoai.includes("khong ro")) {
        type = "chi"; // Mặc định là chi nếu không rõ
        isUnknown = true;
        hasCheck = true;
      }

      const amount = Number(item.so_tien) || 0;

      const matchedWallet = allWallets.find(w => w.name.toLowerCase() === (item.vi || "").toLowerCase());
      const matchedCustomer = allCustomers.find(c => c.name.toLowerCase() === (item.doi_tuong || "").toLowerCase());
      const matchedCategory = allCategories.find(c => c.name.toLowerCase() === (item.danh_muc_con || "").toLowerCase());

      if (!matchedWallet && item.vi && item.vi.toLowerCase() !== "chưa phân loại") hasCheck = true;
      if (!matchedCustomer && item.doi_tuong && item.doi_tuong.toLowerCase() !== "chưa phân loại") hasCheck = true;
      if (!matchedCategory && item.danh_muc_con && item.danh_muc_con.toLowerCase() !== "chưa phân loại") hasCheck = true;

      // Parse date (dd/MM/yyyy) hoặc hôm nay
      let txDate = new Date();
      if (item.ngay_gd && item.ngay_gd.includes("/")) {
        const parts = item.ngay_gd.split("/");
        if (parts.length === 3) {
          txDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }

      const hashContent = `${txDate.toISOString()}_${type}_${amount}_${item.ghi_chu || ""}`;
      const hash = crypto.createHash("sha256").update(hashContent).digest("hex");

      const [newTx] = await db
        .insert(transactions)
        .values({
          sourceSheet: "Telegram",
          sourceKeyHash: hash,
          txDate,
          txType: type,
          amount: amount.toString(),
          walletId: matchedWallet?.id || null,
          customerId: matchedCustomer?.id || null,
          categoryId: matchedCategory?.id || null,
          note: item.ghi_chu || "",
          rawData: item,
          status: hasCheck ? "draft" : "valid",
        })
        .returning();

      createdTxs.push(newTx);

      replyMsg += `\n• <b>${type.toUpperCase()}</b>: ${amount.toLocaleString()} đ ${isUnknown ? "❓ (Không rõ)" : ""}`;
      replyMsg += `\n  - Ví: ${matchedWallet ? matchedWallet.name : `⚠️ ${item.vi || "Trống"}`}`;
      replyMsg += `\n  - Danh mục: ${matchedCategory ? matchedCategory.name : `⚠️ ${item.danh_muc_con || "Trống"}`}`;
      replyMsg += `\n  - Đối tượng: ${matchedCustomer ? matchedCustomer.name : `⚠️ ${item.doi_tuong || "Trống"}`}`;
      if (item.ghi_chu) replyMsg += `\n  - Ghi chú: ${item.ghi_chu}`;
      replyMsg += "\n";
    }

    const txIds = createdTxs.map(t => t.id).join(",");

    if (hasCheck) {
      const finalMsg = `⚠️ <b>CẦN XÁC NHẬN (${createdTxs.length} GD):</b>\n${replyMsg}\n<i>AI không chắc chắn về phân loại hoặc danh mục không có trong sổ tay.</i>`;
      if (pendingMsgId) {
        await editMessage(chatId, pendingMsgId, finalMsg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Ghi sổ", callback_data: `CONFIRM_${txIds}` }, { text: "❌ Hủy", callback_data: `CANCEL_${txIds}` }]
            ]
          }
        });
      } else {
        await sendMessage(chatId, finalMsg, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Ghi sổ", callback_data: `CONFIRM_${txIds}` }, { text: "❌ Hủy", callback_data: `CANCEL_${txIds}` }]
            ]
          }
        });
      }
    } else {
      const finalMsg = `✅ <b>Đã ghi nhận ${createdTxs.length} GD:</b>\n${replyMsg}`;
      if (pendingMsgId) {
        await editMessage(chatId, pendingMsgId, finalMsg, {
          reply_markup: {
            inline_keyboard: [[{ text: "↩️ Hoàn tác", callback_data: `UNDO_${txIds}` }]]
          }
        });
      } else {
        await sendMessage(chatId, finalMsg, {
          reply_markup: {
            inline_keyboard: [[{ text: "↩️ Hoàn tác", callback_data: `UNDO_${txIds}` }]]
          }
        });
      }
    }
  } catch (error: any) {
    console.error("Telegram webhook process error:", error);
    if (pendingMsgId) {
      await editMessage(chatId, pendingMsgId, `❌ Lỗi hệ thống: ${error.message}`);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const config = await getTelegramConfig();
    const requestSecret = req.nextUrl.searchParams.get("secret");
    if (!config.secret || requestSecret !== config.secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Xử lý background không đợi để tránh Telegram retry timeout
    if (body.callback_query) {
      processTelegramCallback(body.callback_query, config).catch(console.error);
    } else if (body.message) {
      processTelegramMessage(body.message, config).catch(console.error);
    }

    // Trả về 200 OK ngay lập tức để Telegram không retry tin nhắn gây spam
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json({ ok: false, error: "Internal Error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Telegram Webhook Endpoint Ready" });
}
