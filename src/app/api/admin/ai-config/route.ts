import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function verifyAdmin(request: NextRequest) {
  const sessionId = request.cookies.get("auth_session")?.value;
  if (!sessionId) return null;

  const sessionData = await validateSession(sessionId);
  if (!sessionData || sessionData.user.role !== "admin") return null;

  return sessionData.user;
}

// Ensure settings table exists
async function ensureSettingsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
  } catch (e) {
    console.error("Failed to ensure settings table:", e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Quyền truy cập bị từ chối" }, { status: 403 });
    }

    await ensureSettingsTable();

    const row = await db.select().from(settings).where(eq(settings.key, "gemini_config")).limit(1);
    const data = row.length > 0 ? row[0].value : null;

    // Default configuration matching GAS
    const defaultConfig = {
      model: "gemini-2.5-flash",
      keys: [],
      key_labels: [],
      owner_names: "",
      prompt: "- Không rõ nguồn → Bank\n- MN = Minh Nghĩa\n- Phân loại rõ ràng Thu/Chi",
    };

    return NextResponse.json({
      config: data || defaultConfig,
    });
  } catch (error) {
    console.error("[GET /api/admin/ai-config]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi tải cấu hình AI" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await verifyAdmin(request);
    if (!adminUser) {
      return NextResponse.json({ error: "Quyền truy cập bị từ chối" }, { status: 403 });
    }

    await ensureSettingsTable();

    const body = await request.json();
    const { model, keys, key_labels, owner_names, prompt } = body;

    const configValue = {
      model: model || "gemini-2.5-flash",
      keys: Array.isArray(keys) ? keys : [],
      key_labels: Array.isArray(key_labels) ? key_labels : [],
      owner_names: owner_names || "",
      prompt: prompt || "",
    };

    await db.execute(sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES ('gemini_config', ${JSON.stringify(configValue)}::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
    `);

    await logAudit({
      userId: adminUser.id,
      action: "UPDATE_AI_CONFIG",
      entityType: "SETTINGS",
      entityId: "gemini_config",
      details: { model: configValue.model, keyCount: configValue.keys.length },
    });

    return NextResponse.json({ success: true, config: configValue });
  } catch (error) {
    console.error("[POST /api/admin/ai-config]:", error);
    return NextResponse.json({ error: "Lỗi hệ thống khi lưu cấu hình AI" }, { status: 500 });
  }
}
