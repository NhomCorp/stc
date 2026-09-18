import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const title = formData.get("title") as string | null;
    const text = formData.get("text") as string | null;

    if (!image) {
      return NextResponse.redirect(new URL("/share-preview?error=NoImage", request.url), 303);
    }

    const name = image.name || "unknown.jpg";
    const size = image.size || 0;

    // TODO sau này: Save image to Storage (S3/VPS), send to Gemini AI...

    return NextResponse.redirect(
      new URL(`/share-preview?name=${encodeURIComponent(name)}&size=${size}&text=${encodeURIComponent(text || "")}`, request.url),
      303
    );
  } catch (err) {
    console.error("Share target error:", err);
    return NextResponse.redirect(new URL("/share-preview?error=Failed", request.url), 303);
  }
}
