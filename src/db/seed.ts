import { db, client } from "./index";
import { users } from "./schema";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  console.log("🌱 Bắt đầu tạo tài khoản Admin mặc định...");
  try {
    const passwordHash = await bcrypt.hash("admin123", 10);
    
    await db.insert(users).values({
      username: "admin",
      passwordHash,
      fullName: "Quản trị viên Hệ thống",
      role: "admin",
      status: "active",
      mustChangePassword: true, // Ép Admin đổi mk lần đầu để test flow
    }).onConflictDoNothing({ target: users.username });

    console.log("✅ Đã tạo/kiểm tra tài khoản 'admin' với mật khẩu 'admin123'");
  } catch (err) {
    console.error("❌ Lỗi tạo seed:", err);
  } finally {
    process.exit(0);
  }
}

seedAdmin();
