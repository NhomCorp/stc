import * as dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { client } from "./index";
import { importLogRows, type LogRowInput } from "@/lib/import-log";

dotenv.config();

async function main() {
  const fileArg = process.argv[2] || "data/log_export.json";
  const filePath = resolve(process.cwd(), fileArg);

  if (!existsSync(filePath)) {
    console.error(`Không tìm thấy file: ${filePath}`);
    console.error("Chạy export từ sheet trước, hoặc truyền đường dẫn JSON.");
    process.exit(1);
  }

  console.log(`Đọc ${filePath}...`);
  const rows = JSON.parse(readFileSync(filePath, "utf-8")) as LogRowInput[];
  console.log(`Import ${rows.length} dòng vào DB...`);

  const result = await importLogRows(rows, { sourceName: "sheet_bulk_import" });
  console.log(JSON.stringify(result, null, 2));
  await client.end();
  process.exit(result.errorRows > 0 && result.validRows === 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await client.end();
  process.exit(1);
});
