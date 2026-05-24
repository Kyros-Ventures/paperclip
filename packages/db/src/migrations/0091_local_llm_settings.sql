CREATE TABLE "local_llm_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" text NOT NULL DEFAULT 'default',
	"config" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"inference_settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "local_llm_settings_singleton_key_idx" ON "local_llm_settings" USING btree ("singleton_key");
