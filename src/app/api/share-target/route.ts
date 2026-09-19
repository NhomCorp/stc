import { NextRequest, NextResponse } from "next/server";
import { callGeminiAPI } from "@/lib/ai-parser";
import { db } from "@/db";
import { transactions, wallets, customers, categories } from "@/db/schema";
import crypto from "crypto";

function wantsJson(request: NextRequest): boolean {
  const format = request.nextUrl.searchParams.get("format");
  if (format === "json") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const useJson = wantsJson(request);

    let base64Image: string | undefined = undefined;
    let imageMimeType = "image/jpeg";
    let text = "";

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const image = (formData.get("image") || formData.get("file")) as File | null;
      text = (formData.get("text") as string) || (formData.get("title") as string) || "";
      
      if (image && typeof image !== "string") {
        imageMimeType = image.type || imageMimeType;
        const bytes = await image.arrayBuffer();
        base64Image = Buffer.from(bytes).toString("base64");
      }
    } else {
      // Nhận Raw Body (iOS Shortcut gửi Yêu cầu nội dung: Tệp)
      imageMimeType = contentType.split(";", 1)[0] || imageMimeType;
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > 0) {
        base64Image = Buffer.from(bytes).toString("base64");
      }
    }

    if (!base64Image) {
      if (useJson) return NextResponse.json({ ok: false, error: "NoImage" }, { status: 400 });
      return NextResponse.redirect(new URL("/share-preview?error=NoImage", request.url), 303);
    }

    // Phân tích qua Gemini
    const parseResult = await callGeminiAPI(text || "Trích xuất giao dịch từ ảnh", base64Image);

    if (parseResult.error) {
      if (useJson) return NextResponse.json({ ok: false, error: parseResult.error }, { status: 500 });
      return NextResponse.redirect(new URL(`/share-preview?error=${encodeURIComponent(parseResult.error)}`, request.url), 303);
    }

    const txList = parseResult.giao_dich || [];

    if (txList.length === 0) {
      if (useJson) return NextResponse.json({ ok: false, error: "Không tìm thấy giao dịch nào từ ảnh." }, { status: 400 });
      return NextResponse.redirect(new URL("/share-preview?error=NoTransactions", request.url), 303);
    }

    // Lấy Master Data để tự khớp Ví / Danh mục / Đối tượng
    const [allWallets, allCustomers, allCategories] = await Promise.all([
      db.select().from(wallets),
      db.select().from(customers),
      db.select().from(categories),
    ]);

    const createdTxs = [];
    const summaryLines = [];

    for (const item of txList) {
      const phanLoai = (item.phan_loai || "").toLowerCase();
      let type = phanLoai.includes("thu") ? "thu" : "chi";
      const amount = Number(item.so_tien) || 0;

      const matchedWallet = allWallets.find(w => w.name.toLowerCase() === (item.vi || "").toLowerCase());
      const matchedCustomer = allCustomers.find(c => c.name.toLowerCase() === (item.doi_tuong || "").toLowerCase());
      const matchedCategory = allCategories.find(c => c.name.toLowerCase() === (item.danh_muc_con || "").toLowerCase());

      let txDate = new Date();
      if (item.ngay_gd && item.ngay_gd.includes("/")) {
        const parts = item.ngay_gd.split("/");
        if (parts.length === 3) {
          txDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }
      }

      const hashContent = `${txDate.toISOString()}_${type}_${amount}_${item.ghi_chu || ""}_${Date.now()}`;
      const hash = crypto.createHash("sha256").update(hashContent).digest("hex");

      const [newTx] = await db
        .insert(transactions)
        .values({
          sourceSheet: "Phím tắt iOS",
          sourceKeyHash: hash,
          txDate,
          txType: type,
          amount: amount.toString(),
          walletId: matchedWallet?.id || null,
          customerId: matchedCustomer?.id || null,
          categoryId: matchedCategory?.id || null,
          note: item.ghi_chu || "",
          rawData: { ...item, _imageBase64: base64Image, _imageMimeType: imageMimeType },
          status: "draft", // Đưa vào danh sách chờ duyệt
        })
        .returning();

      createdTxs.push(newTx);
      summaryLines.push(`${type === "thu" ? "🟢 Thu" : "🔴 Chi"}: ${amount.toLocaleString("vi-VN")}đ (${matchedCategory ? matchedCategory.name : item.danh_muc_con || "Chưa phân loại"})`);
    }

    if (useJson) {
      return NextResponse.json({
        ok: true,
        message: `✅ Đã lưu ${createdTxs.length} giao dịch vào Danh sách chờ duyệt:\n` + summaryLines.join("\n"),
        extracted: txList,
      });
    }

    // Lưu tạm vào URL param để chuyển tiếp cho preview page
    const txDataParam = encodeURIComponent(JSON.stringify(txList));
    return NextResponse.redirect(
      new URL(`/share-preview?data=${txDataParam}`, request.url),
      303
    );
  } catch (err: any) {
    console.error("Share target error:", err);
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    }
    return NextResponse.redirect(new URL(`/share-preview?error=${encodeURIComponent(err.message)}`, request.url), 303);
  }
}
