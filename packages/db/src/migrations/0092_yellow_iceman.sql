CREATE TABLE "assignment_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- NOTE: local_llm_settings table + index already created by 0091_local_llm_settings
ALTER TABLE "assignment_rules" ADD CONSTRAINT "assignment_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_rules_company_enabled_idx" ON "assignment_rules" USING btree ("company_id","enabled");--> statement-breakpoint
CREATE INDEX "assignment_rules_priority_idx" ON "assignment_rules" USING btree ("company_id","priority");