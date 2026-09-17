import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const isDbHealthy = await checkDatabaseConnection();

  if (!isDbHealthy) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      status: "ready",
      database: "connected",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
