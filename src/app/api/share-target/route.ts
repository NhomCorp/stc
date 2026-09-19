import { NextRequest, NextResponse } from "next/server";

function wantsJson(request: NextRequest): boolean {
  const format = request.nextUrl.searchParams.get("format");
  if (format === "json") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("application/json");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const title = formData.get("title") as string | null;
    const text = formData.get("text") as string | null;
    const useJson = wantsJson(request);

    if (!image) {
      if (useJson) {
        return NextResponse.json({ ok: false, error: "NoImage" }, { status: 400 });
      }
      return NextResponse.redirect(new URL("/share-preview?error=NoImage", request.url), 303);
    }

    const name = image.name || "unknown.jpg";
    const size = image.size || 0;

    // TODO sau này: Save image to Storage, send to Gemini AI...

    if (useJson) {
      return NextResponse.json({
        ok: true,
        name,
        size,
        title: title || null,
        text: text || null,
        message: "Nhận ảnh thành công (test)",
      });
    }

    return NextResponse.redirect(
      new URL(
        `/share-preview?name=${encodeURIComponent(name)}&size=${size}&text=${encodeURIComponent(text || "")}`,
        request.url
      ),
      303
    );
  } catch (err) {
    console.error("Share target error:", err);
    if (wantsJson(request)) {
      return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/share-preview?error=Failed", request.url), 303);
  }
}
