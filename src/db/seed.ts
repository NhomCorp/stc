import { db, client } from "./index";
import { users, mailRules } from "./schema";
import bcrypt from "bcryptjs";

const DEFAULT_MAIL_RULES = [
  { keyword: "1386317845729880", walletName: "Bank", customerName: "FE02", categoryName: "ADS", note: "ADS FE02" },
  { keyword: "1570942317581016", walletName: "Bank", customerName: "ADS Momx 03", categoryName: "ADS", note: "ADS Momx 03" },
  { keyword: "1771957883397651", walletName: "Bank", customerName: "ADS Momx 04", categoryName: "ADS", note: "ADS Momx 04" },
  { keyword: "1629367694909727", walletName: "Bank", customerName: "Jeno 01", categoryName: "ADS", note: "ADS Jeno 01" },
  { keyword: "907678055471746", walletName: "Bank", customerName: "MTM 003", categoryName: "ADS", note: "MTM 003" },
  { keyword: "3988917268073085", walletName: "Bank", customerName: "MTM 006", categoryName: "ADS", note: "MTM 006" },
  { keyword: "913920818340153", walletName: "Bank", customerName: "Jeno 03", categoryName: "ADS", note: null },
  { keyword: "587114257525903", walletName: "Bank", customerName: "HOCI 07/25", categoryName: "ADS", note: null },
  { keyword: "2153091822222968", walletName: "Bank", customerName: "MTM 005", categoryName: "ADS", note: null },
  { keyword: "927847176756910", walletName: "Bank", customerName: "MTM 004", categoryName: "ADS", note: null },
  { keyword: "687620569240278", walletName: "Bank", customerName: "Suri GNS 2024", categoryName: "ADS", note: null },
  { keyword: "1380758639667220", walletName: "Bank", customerName: "FE04", categoryName: "ADS", note: null },
  { keyword: "2066926814197436", walletName: "Bank", customerName: "Hoci 005", categoryName: "ADS", note: null },
  { keyword: "1069393482604132", walletName: "Bank", customerName: "Hoci 006", categoryName: "ADS", note: null },
  { keyword: "975660831524554", walletName: "Bank", customerName: "MTM 007", categoryName: "ADS", note: null },
];

async function seedData() {
  console.log("🌱 Bắt đầu tạo dữ liệu mặc định...");
  try {
    const passwordHash = await bcrypt.hash("admin123", 10);
    
    await db.insert(users).values({
      username: "admin",
      passwordHash,
      fullName: "Quản trị viên Hệ thống",
      role: "admin",
      status: "active",
      mustChangePassword: true,
    }).onConflictDoNothing({ target: users.username });

    console.log("✅ Đã tạo/kiểm tra tài khoản 'admin'");

    for (const rule of DEFAULT_MAIL_RULES) {
      await db.insert(mailRules).values(rule).onConflictDoNothing({ target: mailRules.keyword });
    }
    console.log(`✅ Đã seed ${DEFAULT_MAIL_RULES.length} quy tắc so khớp Mail/Ads`);
  } catch (err) {
    console.error("❌ Lỗi tạo seed:", err);
  } finally {
    process.exit(0);
  }
}

seedData();
