CREATE TABLE IF NOT EXISTS "report_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_snapshots_key_unique" UNIQUE("key")
);
