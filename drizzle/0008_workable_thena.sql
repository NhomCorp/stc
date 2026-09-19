CREATE TABLE "mail_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"wallet_name" varchar(255),
	"customer_name" varchar(255),
	"category_name" varchar(255),
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_rules_keyword_unique" UNIQUE("keyword")
);
