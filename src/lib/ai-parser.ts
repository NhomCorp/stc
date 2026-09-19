import { db } from "@/db";
import { eq } from "drizzle-orm";
import { settings, wallets, customers, categories } from "@/db/schema";
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
  const [walletList, customerList, categoryList] = await Promise.all([
    db.select({ name: wallets.name }).from(wallets).where(eq(wallets.isActive, true)),
    db.select({ name: customers.name }).from(customers).where(eq(customers.isActive, true)),
    db.select({ name: categories.name }).from(categories).where(eq(categories.isActive, true)),
  ]);

  return {
    wallets: walletList.map((w) => w.name),
    users: customerList.map((c) => c.name),
    categories: categoryList.map((c) => c.name),
    aliases: [], // P2
    lessons: [], // P2
  };
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
