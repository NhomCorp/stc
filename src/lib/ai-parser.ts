import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import { settings, wallets, customers, categories, aliases, aiLessons } from "@/db/schema";

// Lấy config AI từ DB
export async function getAiConfig() {
  const row = await db.select().from(settings).where(eq(settings.key, "gemini_config")).limit(1);
  if (row.length === 0) return null;
  return row[0].value as {
    model: string;
    keys: string[];
    key_labels: string[];
    owner_names: string;
    prompt: string;
  };
}

export async function getLiveData() {
  const [walletList, customerList, categoryList, aliasList, lessonList] = await Promise.all([
    db.select({ name: wallets.name }).from(wallets).where(eq(wallets.isActive, true)),
    db.select({ name: customers.name }).from(customers).where(eq(customers.isActive, true)),
    db.select({ name: categories.name }).from(categories).where(eq(categories.isActive, true)),
    db.select({ keyword: aliases.keyword, type: aliases.type, targetName: aliases.targetName }).from(aliases).where(eq(aliases.isActive, true)),
    db.select({ sourceText: aiLessons.sourceText, field: aiLessons.field, aiGuess: aiLessons.aiGuess, userFix: aiLessons.userFix }).from(aiLessons).orderBy(desc(aiLessons.updatedAt)).limit(50),
  ]);

  return {
    wallets: walletList.map((w) => w.name),
    users: customerList.map((c) => c.name),
    categories: categoryList.map((c) => c.name),
    aliases: aliasList.map((a) => `${a.keyword} -> ${a.targetName} (${a.type})`),
    lessons: lessonList.map((l) => `Khi nội dung có "${l.sourceText}", AI đoán ${l.field} là "${l.aiGuess}" -> Sửa lại thành "${l.userFix}"`),
  };
}

export async function transcribeVoiceGemini(base64Audio: string, mimeType = "audio/ogg") {
  const config = await getAiConfig();
  if (!config || !config.keys || config.keys.length === 0) {
    return { error: "Chưa cấu hình API Key Gemini." };
  }

  const payload = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Hãy nghe và gõ lại chính xác toàn bộ nội dung tiếng Việt trong đoạn ghi âm sau đây để ghi sổ thu chi. Chỉ trả về văn bản đã nghe, không thêm lời giải thích hay bất kỳ thông tin nào khác." },
        ],
      },
    ],
  };

  const keys = [...config.keys].filter(k => k.trim());
  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data: any = await res.json();
      if (data.error) continue;

      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const rawText = parts.map((p: any) => p.text || "").join("").trim();
      if (rawText) return { text: rawText };
    } catch (e) {}
  }

  return { error: "Không thể nhận diện giọng nói qua Gemini." };
}

export async function callGeminiAPI(text: string, base64Image?: string) {
  const config = await getAiConfig();
  if (!config || !config.keys || config.keys.length === 0) {
    return { error: "Chưa cấu hình API Key Gemini trong hệ thống." };
  }

  const liveData = await getLiveData();
  
  const systemPrompt = config.prompt || "Bạn là trợ lý kế toán bóc tách thu chi cá nhân.";
  const ownerNames = config.owner_names || "";

  const hardRules = `QUY ƯỚC TIỀN TỆ:
- k = nghìn (x1.000), m/tr = triệu (x1.000.000), t/tỷ = tỷ.

QUY TẮC THU/CHI (Đặc biệt với Bill ngân hàng):
- Chủ tài khoản: ${ownerNames || "(Chưa cấu hình)"}.
- Chủ TK chuyển tiền đi / thanh toán / mua sắm -> CHI.
- Người khác chuyển tiền tới cho Chủ TK -> THU.
- Nếu không có bất kỳ dấu hiệu nào rõ ràng -> Phân loại là "Không rõ".`;

  const dynamicPrompt = `${systemPrompt}\n\n${hardRules}\n\nNội dung: "${text}"\n
* SỔ TAY TỪ ĐIỂN:
- Danh sách Ví: [${liveData.wallets.join(", ")}]
- Danh sách Đối tượng: [${liveData.users.join(", ")}]
- Danh sách Danh mục: [${liveData.categories.join(", ")}]
${liveData.aliases.length > 0 ? `\n* TỪ ĐIỂN TÊN GỌI KHÁC (ALIAS):\n${liveData.aliases.map((a) => `- ${a}`).join("\n")}` : ""}
${liveData.lessons.length > 0 ? `\n* BÀI HỌC KINH NGHIỆM TỪ NGƯỜI DÙNG (AI LEARNING):\n${liveData.lessons.map((l) => `- ${l}`).join("\n")}` : ""}

YÊU CẦU:
1. Bóc tách toàn bộ giao dịch trong tin nhắn/ảnh. Nếu không có ngày, ghi "Hôm nay".
2. Khớp đúng tên trong SỔ TAY. Nếu không khớp, ghi "Chưa phân loại".
3. Trả về định dạng JSON DUY NHẤT theo schema:
{
  "giao_dich": [
    {
      "ngay_gd": "dd/MM/yyyy",
      "phan_loai": "Thu/Chi/Không rõ",
      "so_tien": 150000,
      "vi": "...",
      "doi_tuong": "...",
      "danh_muc_con": "...",
      "ghi_chu": "..."
    }
  ]
}`;

  const payload = {
    contents: [
      {
        parts: [
          ...(base64Image ? [{ inlineData: { mimeType: "image/jpeg", data: base64Image } }] : []),
          { text: dynamicPrompt },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };

  const keys = [...config.keys].filter(k => k.trim());
  // Shuffle keys
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  let lastError = "";

  for (const key of keys) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data: any = await res.json();
      if (data.error) {
        lastError = data.error.message || String(data.error);
        continue;
      }

      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      const rawText = parts.map((p: any) => p.text || "").join("");
      if (!rawText) {
        lastError = "Gemini không trả về nội dung.";
        continue;
      }

      try {
        const parsed = JSON.parse(rawText);
        const result = Array.isArray(parsed) ? { giao_dich: parsed } : parsed;
        return result;
      } catch (err: any) {
        lastError = "Không parse được phản hồi Gemini: " + err.message;
        continue;
      }
    } catch (e: any) {
      lastError = e.message;
    }
  }

  return { error: lastError || "Không thể kết nối Gemini API." };
}
