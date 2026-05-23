CREATE TABLE "agent_health_monitor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"task_id" varchar(255),
	"task_type" varchar(100),
	"task_start_time" timestamp with time zone,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"progress" numeric(5, 2) DEFAULT '0',
	"steps_completed" integer DEFAULT 0,
	"steps_total" integer DEFAULT 0,
	"cpu_percent" numeric(5, 2),
	"memory_mb" numeric(10, 2),
	"tokens_consumed" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'healthy' NOT NULL,
	"stuck_count" integer DEFAULT 0,
	"recovery_attempts" integer DEFAULT 0,
	"escalation_level" integer DEFAULT 0,
	"last_stuck_at" timestamp with time zone,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_action" varchar(100),
	"resolution_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_health_monitor_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "agent_recovery_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"recovery_id" varchar(255) NOT NULL,
	"task_id" varchar(255),
	"task_type" varchar(100),
	"trigger_type" varchar(100) NOT NULL,
	"trigger_reason" text,
	"recovery_strategy" varchar(100) NOT NULL,
	"recovery_attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"status" varchar(50) DEFAULT 'in_progress' NOT NULL,
	"success" integer,
	"previous_state" jsonb DEFAULT '{}'::jsonb,
	"recovered_state" jsonb DEFAULT '{}'::jsonb,
	"error_details" jsonb,
	"steps_recovered" integer DEFAULT 0,
	"data_loss" integer DEFAULT 0,
	"data_loss_details" text,
	"initiated_by" varchar(255) DEFAULT 'system' NOT NULL,
	"resolved_by" varchar(255),
	"resolution_action" varchar(100),
	"resolution_notes" text,
	"next_steps" text,
	"rollback_required" integer DEFAULT 0,
	"rollback_completed_at" timestamp with time zone,
	"rollback_details" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_recovery_log_recovery_id_unique" UNIQUE("recovery_id")
);
--> statement-breakpoint
CREATE TABLE "escalation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"company_id" varchar(255) NOT NULL,
	"trigger_type" varchar(100) NOT NULL,
	"trigger_details" jsonb DEFAULT '{}'::jsonb,
	"escalation_level" integer DEFAULT 1 NOT NULL,
	"notification_sent_at" timestamp with time zone,
	"resolved_by" varchar(255),
	"resolution_time_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_queue_id" uuid,
	"action" varchar(50) NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" uuid,
	"from_status" varchar(30),
	"to_status" varchar(30),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"repository" text NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"auto_review_patterns" jsonb DEFAULT '["*.ts","*.js","*.tsx","*.jsx","*.py","*.java","*.go","*.rs","*.sql"]'::jsonb,
	"exclude_patterns" jsonb DEFAULT '["*.test.ts","*.spec.ts","node_modules/*","dist/*","build/*",".git/*","*.min.js","*.lock"]'::jsonb,
	"min_severity_threshold" varchar(20) DEFAULT 'suggestion',
	"require_human_for" jsonb DEFAULT '{"security_critical":true,"large_pr":500,"new_contributor":true,"touching_infrastructure":true}'::jsonb,
	"max_file_size_kb" integer DEFAULT 500,
	"max_total_size_kb" integer DEFAULT 5000,
	"custom_rules" jsonb DEFAULT '{}'::jsonb,
	"custom_prompt_overrides" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_config_project_repository_uq" UNIQUE("project_id","repository")
);
--> statement-breakpoint
CREATE TABLE "ai_review_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_queue_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"line_number" integer,
	"line_end" integer,
	"severity" varchar(20) NOT NULL,
	"category" varchar(50) NOT NULL,
	"message" text NOT NULL,
	"suggested_fix" text,
	"code_snippet" text,
	"is_resolved" boolean DEFAULT false,
	"human_override" varchar(20),
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ai_agent_id" uuid,
	"repository" text,
	"period_date" date DEFAULT now() NOT NULL,
	"period_type" varchar(10) DEFAULT 'daily' NOT NULL,
	"reviews_completed" integer DEFAULT 0,
	"findings_generated" integer DEFAULT 0,
	"findings_confirmed" integer DEFAULT 0,
	"findings_false_positive" integer DEFAULT 0,
	"findings_disputed" integer DEFAULT 0,
	"avg_review_time" integer,
	"avg_human_review_time" integer,
	"security_findings" integer DEFAULT 0,
	"performance_findings" integer DEFAULT 0,
	"style_findings" integer DEFAULT 0,
	"logic_findings" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_review_performance_agent_repo_period_uq" UNIQUE("ai_agent_id","repository","period_date","period_type")
);
--> statement-breakpoint
CREATE TABLE "ai_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"pr_url" text NOT NULL,
	"pr_number" integer NOT NULL,
	"repository" text NOT NULL,
	"branch" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"trigger_type" varchar(30) DEFAULT 'manual' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"ai_agent_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"findings_count" integer DEFAULT 0,
	"summary" text,
	"full_report" jsonb DEFAULT '{}'::jsonb,
	"human_reviewer_id" uuid,
	"human_review_started_at" timestamp with time zone,
	"human_review_completed_at" timestamp with time zone,
	"final_decision" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_upstream_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"remote_url" text NOT NULL,
	"source_instance_id" text NOT NULL,
	"source_instance_fingerprint" text NOT NULL,
	"source_public_key" text NOT NULL,
	"private_key_pem" text NOT NULL,
	"token_status" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"authorized_global_user_id" text,
	"access_token" text,
	"token_id" text,
	"token_expires_at" timestamp with time zone,
	"target_stack_id" text NOT NULL,
	"target_stack_slug" text,
	"target_stack_display_name" text,
	"target_company_id" text NOT NULL,
	"target_origin" text NOT NULL,
	"target_primary_host" text NOT NULL,
	"target_product" text NOT NULL,
	"target_schema_major" integer NOT NULL,
	"target_max_chunk_bytes" integer NOT NULL,
	"pending_state" text,
	"pending_code_verifier" text,
	"pending_redirect_uri" text,
	"pending_token_url" text,
	"last_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_upstream_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"remote_run_id" text,
	"status" text NOT NULL,
	"active_step" text NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"retry_of_run_id" uuid,
	"summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"target_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_secret_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"secret_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"config_path" text NOT NULL,
	"version_selector" text DEFAULT 'latest' NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_secret_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"health_status" text,
	"health_checked_at" timestamp with time zone,
	"health_message" text,
	"health_details" jsonb,
	"disabled_at" timestamp with time zone,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"goal_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"parent_id" uuid,
	"owner_agent_id" uuid,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_recovery_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_issue_id" uuid NOT NULL,
	"recovery_issue_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_type" text DEFAULT 'agent' NOT NULL,
	"owner_agent_id" uuid,
	"owner_user_id" text,
	"previous_owner_agent_id" uuid,
	"return_owner_agent_id" uuid,
	"cause" text NOT NULL,
	"fingerprint" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_action" text NOT NULL,
	"wake_policy" jsonb,
	"monitor_policy" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer,
	"timeout_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"outcome" text,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_access_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"secret_id" uuid NOT NULL,
	"version" integer,
	"provider" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"consumer_type" text NOT NULL,
	"consumer_id" text NOT NULL,
	"config_path" text,
	"issue_id" uuid,
	"heartbeat_run_id" uuid,
	"plugin_id" uuid,
	"outcome" text NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sprint_id" uuid NOT NULL,
	"issue_id" uuid,
	"story_points" integer DEFAULT 0,
	"status" text DEFAULT 'planned' NOT NULL,
	"order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"goal" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"epic_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"points" integer,
	"story_points" integer,
	"complexity_analysis" jsonb,
	"ai_estimated_at" timestamp with time zone,
	"parent_id" uuid,
	"owner_agent_id" uuid,
	"assignee_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"category" text DEFAULT 'issue' NOT NULL,
	"description" text,
	"body" text,
	"variables" jsonb,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"depends_on_id" uuid NOT NULL,
	"dependency_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_reviewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_secret_versions" ADD COLUMN "provider_version_ref" text;--> statement-breakpoint
ALTER TABLE "company_secret_versions" ADD COLUMN "status" text DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_secret_versions" ADD COLUMN "fingerprint_sha256" text NOT NULL;--> statement-breakpoint
ALTER TABLE "company_secret_versions" ADD COLUMN "rotation_job_id" text;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "managed_mode" text DEFAULT 'paperclip_managed' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "provider_config_id" uuid;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "last_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "last_rotated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "company_secrets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "locked_by_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "locked_by_user_id" text;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD COLUMN "routine_revision_id" uuid;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "env" jsonb;--> statement-breakpoint
ALTER TABLE "ai_review_audit_log" ADD CONSTRAINT "ai_review_audit_log_review_queue_id_ai_review_queue_id_fk" FOREIGN KEY ("review_queue_id") REFERENCES "public"."ai_review_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_audit_log" ADD CONSTRAINT "ai_review_audit_log_actor_id_agents_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_config" ADD CONSTRAINT "ai_review_config_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_findings" ADD CONSTRAINT "ai_review_findings_review_queue_id_ai_review_queue_id_fk" FOREIGN KEY ("review_queue_id") REFERENCES "public"."ai_review_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_findings" ADD CONSTRAINT "ai_review_findings_resolved_by_agents_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_performance" ADD CONSTRAINT "ai_review_performance_ai_agent_id_agents_id_fk" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_ai_agent_id_agents_id_fk" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_queue" ADD CONSTRAINT "ai_review_queue_human_reviewer_id_agents_id_fk" FOREIGN KEY ("human_reviewer_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_upstream_connections" ADD CONSTRAINT "cloud_upstream_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_upstream_runs" ADD CONSTRAINT "cloud_upstream_runs_connection_id_cloud_upstream_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."cloud_upstream_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_upstream_runs" ADD CONSTRAINT "cloud_upstream_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_secret_bindings" ADD CONSTRAINT "company_secret_bindings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_secret_bindings" ADD CONSTRAINT "company_secret_bindings_secret_id_company_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_secret_provider_configs" ADD CONSTRAINT "company_secret_provider_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_secret_provider_configs" ADD CONSTRAINT "company_secret_provider_configs_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_parent_id_epics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."epics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_source_issue_id_issues_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_recovery_issue_id_issues_id_fk" FOREIGN KEY ("recovery_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_previous_owner_agent_id_agents_id_fk" FOREIGN KEY ("previous_owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_recovery_actions" ADD CONSTRAINT "issue_recovery_actions_return_owner_agent_id_agents_id_fk" FOREIGN KEY ("return_owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_secret_id_company_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_heartbeat_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("heartbeat_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_access_events" ADD CONSTRAINT "secret_access_events_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_stories" ADD CONSTRAINT "sprint_stories_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_stories" ADD CONSTRAINT "sprint_stories_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_epic_id_epics_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."epics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_parent_id_stories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_assignee_agent_id_agents_id_fk" FOREIGN KEY ("assignee_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_dependencies" ADD CONSTRAINT "issue_dependencies_depends_on_id_issues_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reviewers" ADD CONSTRAINT "issue_reviewers_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reviewers" ADD CONSTRAINT "issue_reviewers_reviewer_id_agents_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_health_monitor_agent_id" ON "agent_health_monitor" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_company_id" ON "agent_health_monitor" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_task_id" ON "agent_health_monitor" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_status" ON "agent_health_monitor" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_last_heartbeat" ON "agent_health_monitor" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_escalation_level" ON "agent_health_monitor" USING btree ("escalation_level");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_created_at" ON "agent_health_monitor" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_health_monitor_company_status" ON "agent_health_monitor" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_agent_id" ON "agent_recovery_log" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_company_id" ON "agent_recovery_log" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_recovery_id" ON "agent_recovery_log" USING btree ("recovery_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_task_id" ON "agent_recovery_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_status" ON "agent_recovery_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_success" ON "agent_recovery_log" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_trigger_type" ON "agent_recovery_log" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_strategy" ON "agent_recovery_log" USING btree ("recovery_strategy");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_started_at" ON "agent_recovery_log" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_created_at" ON "agent_recovery_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_completed_at" ON "agent_recovery_log" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_agent_status" ON "agent_recovery_log" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_company_status" ON "agent_recovery_log" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_recovery_log_company_started" ON "agent_recovery_log" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_agent_id" ON "escalation_history" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_company_id" ON "escalation_history" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_trigger_type" ON "escalation_history" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_escalation_level" ON "escalation_history" USING btree ("escalation_level");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_created_at" ON "escalation_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_escalation_history_company_created" ON "escalation_history" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_review_audit_log_queue" ON "ai_review_audit_log" USING btree ("review_queue_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_audit_log_action" ON "ai_review_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_ai_review_audit_log_created" ON "ai_review_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_review_config_project" ON "ai_review_config" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_config_repository" ON "ai_review_config" USING btree ("repository");--> statement-breakpoint
CREATE INDEX "idx_ai_review_config_enabled" ON "ai_review_config" USING btree ("is_enabled") WHERE "ai_review_config"."is_enabled" = true;--> statement-breakpoint
CREATE INDEX "idx_ai_review_findings_queue_id" ON "ai_review_findings" USING btree ("review_queue_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_findings_severity" ON "ai_review_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_ai_review_findings_category" ON "ai_review_findings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_ai_review_findings_unresolved" ON "ai_review_findings" USING btree ("review_queue_id") WHERE NOT "ai_review_findings"."is_resolved";--> statement-breakpoint
CREATE INDEX "idx_ai_review_findings_critical" ON "ai_review_findings" USING btree ("review_queue_id","severity") WHERE "ai_review_findings"."severity" = 'critical';--> statement-breakpoint
CREATE INDEX "idx_ai_review_performance_agent" ON "ai_review_performance" USING btree ("ai_agent_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_performance_period" ON "ai_review_performance" USING btree ("period_date","period_type");--> statement-breakpoint
CREATE INDEX "idx_ai_review_performance_repository" ON "ai_review_performance" USING btree ("repository");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_issue_id" ON "ai_review_queue" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_status" ON "ai_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_priority" ON "ai_review_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_ai_agent" ON "ai_review_queue" USING btree ("ai_agent_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_human_reviewer" ON "ai_review_queue" USING btree ("human_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_repository" ON "ai_review_queue" USING btree ("repository");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_created_at" ON "ai_review_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_pending" ON "ai_review_queue" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_ai_reviewed" ON "ai_review_queue" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ai_review_queue_completed" ON "ai_review_queue" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "cloud_upstream_connections_company_idx" ON "cloud_upstream_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "cloud_upstream_runs_company_created_idx" ON "cloud_upstream_runs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "cloud_upstream_runs_connection_idx" ON "cloud_upstream_runs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "company_secret_bindings_company_idx" ON "company_secret_bindings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_secret_bindings_secret_idx" ON "company_secret_bindings" USING btree ("secret_id");--> statement-breakpoint
CREATE INDEX "company_secret_bindings_target_idx" ON "company_secret_bindings" USING btree ("company_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_secret_bindings_target_path_uq" ON "company_secret_bindings" USING btree ("company_id","target_type","target_id","config_path");--> statement-breakpoint
CREATE INDEX "company_secret_provider_configs_company_idx" ON "company_secret_provider_configs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_secret_provider_configs_company_provider_idx" ON "company_secret_provider_configs" USING btree ("company_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "company_secret_provider_configs_default_uq" ON "company_secret_provider_configs" USING btree ("company_id","provider") WHERE "company_secret_provider_configs"."is_default" = true;--> statement-breakpoint
CREATE INDEX "epics_company_idx" ON "epics" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "epics_goal_idx" ON "epics" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "epics_parent_idx" ON "epics" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "issue_recovery_actions_company_source_status_idx" ON "issue_recovery_actions" USING btree ("company_id","source_issue_id","status");--> statement-breakpoint
CREATE INDEX "issue_recovery_actions_company_owner_status_idx" ON "issue_recovery_actions" USING btree ("company_id","owner_agent_id","status");--> statement-breakpoint
CREATE INDEX "issue_recovery_actions_company_recovery_issue_idx" ON "issue_recovery_actions" USING btree ("company_id","recovery_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_recovery_actions_active_source_uq" ON "issue_recovery_actions" USING btree ("company_id","source_issue_id") WHERE "issue_recovery_actions"."status" in ('active', 'escalated');--> statement-breakpoint
CREATE UNIQUE INDEX "issue_recovery_actions_active_fingerprint_uq" ON "issue_recovery_actions" USING btree ("company_id","source_issue_id","cause","fingerprint") WHERE "issue_recovery_actions"."status" in ('active', 'escalated');--> statement-breakpoint
CREATE INDEX "secret_access_events_company_created_idx" ON "secret_access_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_access_events_secret_created_idx" ON "secret_access_events" USING btree ("secret_id","created_at");--> statement-breakpoint
CREATE INDEX "secret_access_events_consumer_idx" ON "secret_access_events" USING btree ("company_id","consumer_type","consumer_id");--> statement-breakpoint
CREATE INDEX "secret_access_events_run_idx" ON "secret_access_events" USING btree ("heartbeat_run_id");--> statement-breakpoint
CREATE INDEX "stories_company_idx" ON "stories" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "stories_epic_idx" ON "stories" USING btree ("epic_id");--> statement-breakpoint
CREATE INDEX "stories_parent_idx" ON "stories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_issue_id_idx" ON "issue_dependencies" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_depends_on_id_idx" ON "issue_dependencies" USING btree ("depends_on_id");--> statement-breakpoint
CREATE INDEX "issue_dependencies_type_idx" ON "issue_dependencies" USING btree ("dependency_type");--> statement-breakpoint
CREATE INDEX "issue_dependencies_issue_type_idx" ON "issue_dependencies" USING btree ("issue_id","dependency_type");--> statement-breakpoint
CREATE INDEX "issue_dependencies_unique_idx" ON "issue_dependencies" USING btree ("issue_id","depends_on_id");--> statement-breakpoint
CREATE INDEX "idx_issue_reviewers_issue_id" ON "issue_reviewers" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_issue_reviewers_reviewer_id" ON "issue_reviewers" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_issue_reviewers_status" ON "issue_reviewers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_issue_reviewers_decision" ON "issue_reviewers" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "idx_issue_reviewers_pending" ON "issue_reviewers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_issue_reviewers_unique" ON "issue_reviewers" USING btree ("issue_id","reviewer_id");--> statement-breakpoint
ALTER TABLE "company_secrets" ADD CONSTRAINT "company_secrets_provider_config_id_company_secret_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."company_secret_provider_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_locked_by_agent_id_agents_id_fk" FOREIGN KEY ("locked_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_runs" ADD CONSTRAINT "routine_runs_routine_revision_id_routine_revisions_id_fk" FOREIGN KEY ("routine_revision_id") REFERENCES "public"."routine_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_secret_versions_fingerprint_idx" ON "company_secret_versions" USING btree ("fingerprint_sha256");--> statement-breakpoint
CREATE INDEX "company_secrets_provider_config_idx" ON "company_secrets" USING btree ("provider_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_secrets_company_key_uq" ON "company_secrets" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "documents_title_search_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_latest_body_search_idx" ON "documents" USING gin ("latest_body" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "routine_runs_revision_idx" ON "routine_runs" USING btree ("routine_revision_id");