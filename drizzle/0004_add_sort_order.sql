ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_groups" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_sort_order_idx" ON "categories" USING btree ("sort_order");
