#!/bin/bash
# ==============================================================================
# Script Backup PostgreSQL — Sổ Thu Chi (Production VPS)
# User vận hành: stcadmin
# Thư mục lưu trữ: /home/stcadmin/backups/db
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/stcadmin/backups/db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOG_FILE="${BACKUP_LOG_FILE:-${BACKUP_DIR}/backup.log}"
CONTAINER_NAME="${PG_CONTAINER:-stc-postgres}"
DB_USER="${POSTGRES_USER:-stcadmin}"
DB_NAME="${POSTGRES_DB:-stc}"

mkdir -p "$BACKUP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "▶ Bắt đầu tiến trình sao lưu database..."

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/stc_backup_${TIMESTAMP}.sql.gz"
TEMP_FILE="${BACKUP_FILE}.tmp"

# Kiểm tra container postgres có đang chạy không
if ! docker ps --filter "name=${CONTAINER_NAME}" --filter "status=running" --format "{{.Names}}" | grep -q "${CONTAINER_NAME}"; then
  log "❌ Lỗi: Container ${CONTAINER_NAME} không đang chạy!"
  exit 1
fi

# Chạy pg_dump từ trong container và nén trực tiếp
if docker exec -i "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip -6 > "${TEMP_FILE}"; then
  mv "${TEMP_FILE}" "${BACKUP_FILE}"
  log "✔ Đã xuất dump và nén: ${BACKUP_FILE}"
else
  log "❌ Lỗi trong quá trình xuất dump"
  rm -f "${TEMP_FILE}"
  exit 1
fi

# 1. Kiểm tra file tồn tại và dung lượng > 0
if [ ! -s "${BACKUP_FILE}" ]; then
  log "❌ Lỗi: File backup rỗng hoặc không tồn tại"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# 2. Kiểm tra tính toàn vẹn file nén bằng gzip -t
if ! gzip -t "${BACKUP_FILE}" 2>/dev/null; then
  log "❌ Lỗi: File backup bị hỏng (kiểm tra gzip -t thất bại)"
  rm -f "${BACKUP_FILE}"
  exit 1
fi
log "✔ Kiểm tra tính toàn vẹn (gzip -t): Hợp lệ"

# 3. Phân quyền bảo mật 600
chmod 600 "${BACKUP_FILE}"
log "✔ Đã thiết lập quyền chmod 600 cho ${BACKUP_FILE}"

# 4. Xoay vòng retention (xóa các file cũ hơn RETENTION_DAYS)
log "▶ Áp dụng chính sách lưu trữ (retention: ${RETENTION_DAYS} ngày)..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -name "stc_backup_*.sql.gz" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED_COUNT}" -gt 0 ]; then
  log "✔ Đã dọn dẹp ${DELETED_COUNT} file backup cũ quá hạn"
fi

TOTAL_BACKUPS=$(find "${BACKUP_DIR}" -name "stc_backup_*.sql.gz" -type f | wc -l)
log "✅ Sao lưu hoàn tất thành công. Hiện có ${TOTAL_BACKUPS} bản backup trong thư mục."
