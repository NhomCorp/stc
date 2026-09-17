import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as dotenv from "dotenv";
import { db, client } from "./index";

dotenv.config();

const runMigration = async () => {
  console.log("🚀 Starting database migration...");

  try {
    await migrate(db, {
      migrationsFolder: "./drizzle",
    });
    console.log("✅ Migration completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

runMigration();
