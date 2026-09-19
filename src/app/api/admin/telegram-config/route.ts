import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const row = await db.select().from(settings).where(eq(settings.key, "telegram_config")).limit(1);
  const data = row.length > 0 ? row[0].value : null;
  return NextResponse.json({ config: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const validData = {
    token: typeof body.token === "string" ? body.token.trim() : "",
    adminId: typeof body.adminId === "string" ? body.adminId.trim() : "",
    secret: typeof body.secret === "string" ? body.secret.trim() : "",
  };

  const existing = await db.select().from(settings).where(eq(settings.key, "telegram_config")).limit(1);
  
  if (existing.length > 0) {
    await db.update(settings).set({ value: validData }).where(eq(settings.key, "telegram_config"));
  } else {
    await db.insert(settings).values({ key: "telegram_config", value: validData });
  }

  return NextResponse.json({ success: true });
}
