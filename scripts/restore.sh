#!/bin/bash
# ==============================================================================
# Script Phục hồi PostgreSQL — Sổ Thu Chi
# User vận hành: stcadmin
# Cú pháp: ./restore.sh <đường_dẫn_file_backup.sql.gz> [tên_database_mục_tiêu]
# LƯU Ý: Tuyệt đối không tự động restore vào database chính.
# ==============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
# Mặc định khôi phục vào database tạm để kiểm tra tính hợp lệ dữ liệu
TARGET_DB="${2:-stc_restore_test}"
CONTAINER_NAME="${PG_CONTAINER:-stc-postgres}"
DB_USER="${POSTGRES_USER:-stcadmin}"

if [ -z "$BACKUP_FILE" ]; then
  echo "❌ Lỗi: Bắt buộc phải truyền đường dẫn file backup cụ thể!"
  echo "   Cách dùng: $0 /home/stcadmin/backups/db/stc_backup_YYYYMMDD_HHMMSS.sql.gz [tên_database]"
  echo "   Ví dụ khôi phục kiểm thử: $0 /home/stcadmin/backups/db/stc_backup_20260916_120000.sql.gz stc_restore_test"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
  echo "❌ Lỗi: File backup không tồn tại hoặc rỗng: ${BACKUP_FILE}"
  exit 1
fi

# 1. Kiểm tra tính toàn vẹn file nén trước khi xử lý
echo "▶ Đang kiểm tra tính toàn vẹn của file backup (gzip -t)..."
if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
  echo "❌ Lỗi: File backup bị lỗi cấu trúc gzip hoặc bị hỏng."
  exit 1
fi
echo "✔ File gzip hợp lệ."

# 2. Cảnh báo an toàn nếu chỉ định database chính
if [ "$TARGET_DB" = "stc" ]; then
  echo "⚠️ CẢNH BÁO: Bạn đang yêu cầu khôi phục trực tiếp vào DATABASE CHÍNH ('stc')!"
  echo "   Dữ liệu hiện tại có thể bị ghi đè hoàn toàn."
else
  echo "ℹ Khôi phục vào database mục tiêu/kiểm thử: '${TARGET_DB}'"
fi

read -rp "Xác nhận tiếp tục tiến trình khôi phục? (nhập 'yes' để xác nhận): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "⏹ Đã hủy thao tác khôi phục an toàn."
  exit 0
fi

# 3. Tạo database đích nếu chưa tồn tại
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d postgres -c "CREATE DATABASE \"${TARGET_DB}\";" 2>/dev/null || true

# 4. Giải nén và nạp dữ liệu vào database đích
echo "▶ Đang giải nén và nạp dữ liệu vào '${TARGET_DB}'..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${TARGET_DB}"

echo "✅ Phục hồi hoàn tất thành công vào database '${TARGET_DB}'."
