import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { requireUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Invalid id", { status: 400 });

  const [row] = await db
    .select({ rawData: transactions.rawData, status: transactions.status })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  const raw = row?.rawData as { _imageBase64?: string; _imageMimeType?: string } | null;
  if (!row || !raw?._imageBase64) {
    return new NextResponse("Image not found", { status: 404 });
  }

  return new NextResponse(Buffer.from(raw._imageBase64, "base64"), {
    headers: {
      "Content-Type": raw._imageMimeType || "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline",
    },
  });
}
