import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL || "postgres://stcadmin:stcadmin123@localhost:5432/stc";

// Disable prefetch as it is not supported for "Transaction" pool mode if used
export const client = postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 10 : 2,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

/**
 * Kiểm tra kết nối Database (Readiness probe)
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const result = await client`SELECT 1 as healthy`;
    return result && result.length > 0 && result[0].healthy === 1;
  } catch (error) {
    console.error("Database healthcheck failed:", error);
    return false;
  }
}
