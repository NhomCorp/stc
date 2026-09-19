CREATE TABLE "ai_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_text" text NOT NULL,
	"field" varchar(50) NOT NULL,
	"ai_guess" varchar(255) NOT NULL,
	"user_fix" varchar(255) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"target_name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aliases_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_lessons_unique_idx" ON "ai_lessons" USING btree ("source_text","field","ai_guess","user_fix");