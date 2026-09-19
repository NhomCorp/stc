import { NextRequest, NextResponse } from "next/server";
import { sendMessage, getFile } from "@/lib/telegram";
import { callGeminiAPI } from "@/lib/ai-parser";
import { db } from "@/db";
import { transactions, wallets, customers, categories } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import crypto from "crypto";
import { getTelegramConfig } from "@/lib/telegram-config";

export async function POST(req: NextRequest) {
  try {
    const config = await getTelegramConfig();
    const requestSecret = req.nextUrl.searchParams.get("secret");
    if (!config.secret || requestSecret !== config.secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // 1. Chỉ xử lý Message có nội dung
    const message = body.message;
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    if (config.adminId && String(chatId) !== String(config.adminId)) {
      return NextResponse.json({ ok: true }); // Bỏ qua tin nhắn không phải của admin
    }

    let text = message.text || message.caption || "";

    // Lấy ảnh nếu có
    let base64Image: string | undefined = undefined;
    if (message.photo && message.photo.length > 0) {
      const highestResPhoto = message.photo[message.photo.length - 1];
      const base64 = await getFile(highestResPhoto.file_id);
      if (base64) {
        base64Image = base64;
      }
    }

    if (!text && !base64Image) {
      return NextResponse.json({ ok: true });
    }

    // Gửi phản hồi tạm thời
    await sendMessage(chatId, "🧠 Đang xử lý giao dịch qua Gemini AI...");

    // 2. Bóc tách bằng Gemini AI
    const parseResult = await callGeminiAPI(text, base64Image);

    if (parseResult.error) {
      await sendMessage(chatId, `❌ Lỗi AI: ${parseResult.error}`);
      return NextResponse.json({ ok: true });
    }

    const txList = parseResult.giao_dich || [];
    if (txList.length === 0) {
      await sendMessage(chatId, "⚠️ Không tìm thấy giao dịch nào.");
      return NextResponse.json({ ok: true });
    }

    // 3. Cache các bảng danh mục để map ID
    const [allWallets, allCustomers, allCategories] = await Promise.all([
      db.select().from(wallets),
      db.select().from(customers),
      db.select().from(categories),
    ]);

    const createdTxs = [];

    // 4. Lưu từng giao dịch vào DB
    for (const item of txList) {
      const type = (item.phan_loai || "").toLowerCase().includes("thu") ? "thu" : "chi";
      const amount = Number(item.so_tien) || 0;

      // Tìm walletId
      const matchedWallet = allWallets.find(
        (w) => w.name.toLowerCase() === (item.vi || "").toLowerCase()
      );

      // Tìm customerId
      const matchedCustomer = allCustomers.find(
        (c) => c.name.toLowerCase() === (item.doi_tuong || "").toLowerCase()
      );

      // Tìm categoryId
      const matchedCategory = allCategories.find(
        (c) => c.name.toLowerCase() === (item.danh_muc_con || "").toLowerCase()
      );

      // Parse date (dd/MM/yyyy) hoặc fallback hôm nay
      let txDate = new Date();
      if (item.ngay_gd && item.ngay_gd.includes("/")) {
        const parts = item.ngay_gd.split("/");
        if (parts.length === 3) {
          txDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }

      // Hash chống trùng đơn giản
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
          status: "valid",
        })
        .returning();

      createdTxs.push({
        ...item,
        id: newTx?.id,
      });
    }

    // 5. Gửi thông báo thành công về Telegram
    let replyMsg = `✅ <b>Đã ghi nhận ${createdTxs.length} giao dịch:</b>\n`;
    for (const tx of createdTxs) {
      replyMsg += `\n• <b>${tx.phan_loai.toUpperCase()}:</b> ${Number(tx.so_tien).toLocaleString()} đ`;
      replyMsg += `\n  - Ví: ${tx.vi || "N/A"}`;
      replyMsg += `\n  - Danh mục: ${tx.danh_muc_con || "N/A"}`;
      replyMsg += `\n  - Đối tượng: ${tx.doi_tuong || "N/A"}`;
      if (tx.ghi_chu) replyMsg += `\n  - Ghi chú: ${tx.ghi_chu}`;
      replyMsg += "\n";
    }

    await sendMessage(chatId, replyMsg);

    return NextResponse.json({ ok: true, data: createdTxs });
  } catch (error: any) {
    console.error("Telegram Webhook Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Telegram Webhook Endpoint Ready" });
}
