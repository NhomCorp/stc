import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  varchar,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ==========================================
// 1. Quản lý Người dùng & Phiên đăng nhập
// ==========================================

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 100 }),
  role: varchar("role", { length: 20 }).default("member").notNull(), // 'admin' | 'member'
  status: varchar("status", { length: 20 }).default("active").notNull(), // 'active' | 'locked'
  mustChangePassword: boolean("must_change_password").default(true).notNull(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  };
});

// ==========================================
// 2. Nhật ký Thao tác (Audit Log)
// ==========================================

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: varchar("entity_id", { length: 100 }),
  details: jsonb("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    userActionIdx: index("audit_logs_user_action_idx").on(table.userId, table.action),
    createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  };
});

// ==========================================
// 3. Nguồn & Lịch sử Đồng bộ
// ==========================================

export const syncSources = pgTable("sync_sources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 50 }).default("google_sheets").notNull(),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => syncSources.id, { onDelete: "cascade" }),
  sheetName: varchar("sheet_name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // 'pending' | 'running' | 'success' | 'warning' | 'failed'
  totalRows: integer("total_rows").default(0).notNull(),
  validRows: integer("valid_rows").default(0).notNull(),
  duplicateRows: integer("duplicate_rows").default(0).notNull(),
  errorRows: integer("error_rows").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => {
  return {
    sheetNameIdx: index("sync_runs_sheet_name_idx").on(table.sheetName),
    statusIdx: index("sync_runs_status_idx").on(table.status),
  };
});

// ==========================================
// 4. Danh mục Master Data
// ==========================================

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const wallets = pgTable("wallets", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/** Danh mục cha (Ăn uống, Công việc…) — khớp Tóm tắt_v2 */
export const categoryGroups = pgTable("category_groups", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/**
 * Danh mục con (ADS, Cafe…) — không gắn thu/chi.
 * Thu/Chi chỉ nằm trên transactions.tx_type.
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  groupId: integer("group_id").references(() => categoryGroups.id, { onDelete: "set null" }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
}, (table) => {
  return {
    groupIdIdx: index("categories_group_id_idx").on(table.groupId),
    sortOrderIdx: index("categories_sort_order_idx").on(table.sortOrder),
  };
});

/** Giữ bảng (legacy); app không dùng — ví đã đủ Cash/Bank/Credit */
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 5. Giao dịch (Transactions)
// ==========================================

// ==========================================
// 7. Cấu hình hệ thống (Settings)
// ==========================================

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});


export const reportSnapshots = pgTable("report_snapshots", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  payload: jsonb("payload").notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
  
  // Thông tin nguồn để truy ngược
  sourceFile: varchar("source_file", { length: 255 }),
  sourceSheet: varchar("source_sheet", { length: 100 }).notNull(),
  sourceRowIndex: integer("source_row_index"),
  sourceKeyHash: varchar("source_key_hash", { length: 64 }).notNull(), // Khóa băm chống trùng
  
  // Dữ liệu nghiệp vụ chuẩn hóa
  txDate: timestamp("tx_date", { withTimezone: true }).notNull(),
  txType: varchar("tx_type", { length: 20 }).notNull(), // 'thu' | 'chi'
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  walletId: integer("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
  paymentMethodId: integer("payment_method_id").references(() => paymentMethods.id, { onDelete: "set null" }),
  
  note: text("note"),
  rawData: jsonb("raw_data"),
  status: varchar("status", { length: 20 }).default("valid").notNull(), // 'valid' | 'duplicate' | 'warning' | 'error'
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    sourceKeyHashIdx: uniqueIndex("tx_source_key_hash_idx").on(table.sourceSheet, table.sourceKeyHash),
    txDateIdx: index("tx_date_idx").on(table.txDate),
    statusIdx: index("tx_status_idx").on(table.status),
    customerIdIdx: index("tx_customer_id_idx").on(table.customerId),
    walletIdIdx: index("tx_wallet_id_idx").on(table.walletId),
    categoryIdIdx: index("tx_category_id_idx").on(table.categoryId),
  };
});
