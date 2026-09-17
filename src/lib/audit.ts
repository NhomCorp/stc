import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export interface LogAuditParams {
  userId?: number | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Ghi nhận log kiểm tra và vận hành hệ thống (Audit Log)
 */
export async function logAudit({
  userId,
  action,
  entityType,
  entityId,
  details,
  ipAddress,
}: LogAuditParams): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: userId ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      details: details ?? null,
      ipAddress: ipAddress ?? null,
    });
  } catch (error) {
    // Không để lỗi audit log làm sập luồng chính nhưng cần ghi ra console
    console.error("[AuditLog Error]:", error);
  }
}
