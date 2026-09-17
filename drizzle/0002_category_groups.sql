CREATE TABLE IF NOT EXISTS "category_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50),
	"name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_groups_code_unique" UNIQUE("code"),
	CONSTRAINT "category_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "group_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_group_id_category_groups_id_fk"
   FOREIGN KEY ("group_id") REFERENCES "public"."category_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Gộp danh mục trùng tên (ADS thu + ADS chi → 1 bản ghi)
WITH ranked AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY lower(trim(name)) ORDER BY id) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY lower(trim(name)) ORDER BY id) AS keep_id
  FROM categories
)
UPDATE transactions t
SET category_id = ranked.keep_id
FROM ranked
WHERE t.category_id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY lower(trim(name)) ORDER BY id) AS rn
  FROM categories
)
DELETE FROM categories
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN IF EXISTS "type";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_name_unique" UNIQUE("name");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_group_id_idx" ON "categories" ("group_id");
--> statement-breakpoint
-- Seed nhóm + map danh mục con (master Tóm tắt_v2)
INSERT INTO category_groups (name) VALUES
  ('Ăn uống'),
  ('Quà tặng'),
  ('Nhà'),
  ('Công việc'),
  ('Giải trí'),
  ('Đi lại'),
  ('Shoping'),
  ('Chưa phân loại')
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO categories (name, group_id)
SELECT v.child, g.id
FROM (VALUES
  ('Ăn uống', 'Ăn sáng'),
  ('Ăn uống', 'Ăn trưa'),
  ('Ăn uống', 'Ăn tối'),
  ('Ăn uống', 'Cafe'),
  ('Quà tặng', 'Quà tặng'),
  ('Nhà', 'Phí quản lý'),
  ('Nhà', 'Điện nước'),
  ('Nhà', 'Vé xe'),
  ('Nhà', 'Mua sắm'),
  ('Công việc', 'ADS'),
  ('Công việc', 'Tài khoản'),
  ('Công việc', 'Lái xe'),
  ('Công việc', 'Khác'),
  ('Giải trí', 'Giải trí'),
  ('Đi lại', 'Xăng xe'),
  ('Đi lại', 'Grab'),
  ('Đi lại', 'Taxi'),
  ('Shoping', 'Làm đẹp'),
  ('Shoping', 'Shopee'),
  ('Shoping', 'Lazada'),
  ('Chưa phân loại', 'Chưa phân loại')
) AS v(group_name, child)
JOIN category_groups g ON g.name = v.group_name
ON CONFLICT (name) DO UPDATE SET group_id = EXCLUDED.group_id;
