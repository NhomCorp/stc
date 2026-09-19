import { NextRequest, NextResponse } from "next/server";
import { callGeminiAPI } from "@/lib/ai-parser";

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
    let text = "";

    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const image = (formData.get("image") || formData.get("file")) as File | null;
      text = (formData.get("text") as string) || (formData.get("title") as string) || "";
      
      if (image && typeof image !== "string") {
        const bytes = await image.arrayBuffer();
        base64Image = Buffer.from(bytes).toString("base64");
      }
    } else {
      // Nhận Raw Body (iOS Shortcut gửi Yêu cầu nội dung: Tệp)
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

    if (useJson) {
      return NextResponse.json({
        ok: true,
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
