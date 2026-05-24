import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  boolean,
  varchar,
  date,
  unique,
} from "drizzle-orm/pg-core";
import { issues } from "./issues.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";

export const aiReviewQueue = pgTable(
  "ai_review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    prUrl: text("pr_url").notNull(),
    prNumber: integer("pr_number").notNull(),
    repository: text("repository").notNull(),
    branch: text("branch").notNull(),
    baseBranch: text("base_branch").notNull().default("main"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    triggerType: varchar("trigger_type", { length: 30 }).notNull().default("manual"),
    priority: integer("priority").notNull().default(5),
    aiAgentId: uuid("ai_agent_id").references(() => agents.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    findingsCount: integer("findings_count").default(0),
    summary: text("summary"),
    fullReport: jsonb("full_report").default({}),
    humanReviewerId: uuid("human_reviewer_id").references(() => agents.id),
    humanReviewStartedAt: timestamp("human_review_started_at", { withTimezone: true }),
    humanReviewCompletedAt: timestamp("human_review_completed_at", { withTimezone: true }),
    finalDecision: varchar("final_decision", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueIdIdx: index("idx_ai_review_queue_issue_id").on(table.issueId),
    statusIdx: index("idx_ai_review_queue_status").on(table.status),
    priorityIdx: index("idx_ai_review_queue_priority").on(table.priority),
    aiAgentIdx: index("idx_ai_review_queue_ai_agent").on(table.aiAgentId),
    humanReviewerIdx: index("idx_ai_review_queue_human_reviewer").on(table.humanReviewerId),
    repositoryIdx: index("idx_ai_review_queue_repository").on(table.repository),
    createdAtIdx: index("idx_ai_review_queue_created_at").on(table.createdAt),
    pendingIdx: index("idx_ai_review_queue_pending").on(table.status, table.priority),
    aiReviewedIdx: index("idx_ai_review_queue_ai_reviewed").on(table.status, table.updatedAt),
    completedIdx: index("idx_ai_review_queue_completed").on(table.completedAt),
  }),
);

export const aiReviewFindings = pgTable(
  "ai_review_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewQueueId: uuid("review_queue_id")
      .notNull()
      .references(() => aiReviewQueue.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    lineNumber: integer("line_number"),
    lineEnd: integer("line_end"),
    severity: varchar("severity", { length: 20 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    message: text("message").notNull(),
    suggestedFix: text("suggested_fix"),
    codeSnippet: text("code_snippet"),
    isResolved: boolean("is_resolved").default(false),
    humanOverride: varchar("human_override", { length: 20 }),
    resolvedBy: uuid("resolved_by").references(() => agents.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionComment: text("resolution_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    queueIdIdx: index("idx_ai_review_findings_queue_id").on(table.reviewQueueId),
    severityIdx: index("idx_ai_review_findings_severity").on(table.severity),
    categoryIdx: index("idx_ai_review_findings_category").on(table.category),
    unresolvedIdx: index("idx_ai_review_findings_unresolved")
      .on(table.reviewQueueId)
      .where(sql`NOT ${table.isResolved}`),
    criticalIdx: index("idx_ai_review_findings_critical")
      .on(table.reviewQueueId, table.severity)
      .where(sql`${table.severity} = 'critical'`),
  }),
);

export const aiReviewConfig = pgTable(
  "ai_review_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    repository: text("repository").notNull(),
    isEnabled: boolean("is_enabled").default(true),
    autoReviewPatterns: jsonb("auto_review_patterns").default(
      ["*.ts", "*.js", "*.tsx", "*.jsx", "*.py", "*.java", "*.go", "*.rs", "*.sql"],
    ),
    excludePatterns: jsonb("exclude_patterns").default(
      ["*.test.ts", "*.spec.ts", "node_modules/*", "dist/*", "build/*", ".git/*", "*.min.js", "*.lock"],
    ),
    minSeverityThreshold: varchar("min_severity_threshold", { length: 20 }).default("suggestion"),
    requireHumanFor: jsonb("require_human_for").default(
      { security_critical: true, large_pr: 500, new_contributor: true, touching_infrastructure: true },
    ),
    maxFileSizeKb: integer("max_file_size_kb").default(500),
    maxTotalSizeKb: integer("max_total_size_kb").default(5000),
    customRules: jsonb("custom_rules").default({}),
    customPromptOverrides: jsonb("custom_prompt_overrides").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index("idx_ai_review_config_project").on(table.projectId),
    repositoryIdx: index("idx_ai_review_config_repository").on(table.repository),
    enabledIdx: index("idx_ai_review_config_enabled")
      .on(table.isEnabled)
      .where(sql`${table.isEnabled} = true`),
    projectRepositoryUq: unique("ai_review_config_project_repository_uq").on(
      table.projectId,
      table.repository,
    ),
  }),
);

export const aiReviewAuditLog = pgTable(
  "ai_review_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewQueueId: uuid("review_queue_id").references(() => aiReviewQueue.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 50 }).notNull(),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    actorId: uuid("actor_id").references(() => agents.id),
    fromStatus: varchar("from_status", { length: 30 }),
    toStatus: varchar("to_status", { length: 30 }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    queueIdx: index("idx_ai_review_audit_log_queue").on(table.reviewQueueId),
    actionIdx: index("idx_ai_review_audit_log_action").on(table.action),
    createdIdx: index("idx_ai_review_audit_log_created").on(table.createdAt),
  }),
);

export const aiReviewPerformance = pgTable(
  "ai_review_performance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiAgentId: uuid("ai_agent_id").references(() => agents.id, { onDelete: "set null" }),
    repository: text("repository"),
    periodDate: date("period_date").notNull().defaultNow(),
    periodType: varchar("period_type", { length: 10 }).notNull().default("daily"),
    reviewsCompleted: integer("reviews_completed").default(0),
    findingsGenerated: integer("findings_generated").default(0),
    findingsConfirmed: integer("findings_confirmed").default(0),
    findingsFalsePositive: integer("findings_false_positive").default(0),
    findingsDisputed: integer("findings_disputed").default(0),
    avgReviewTime: integer("avg_review_time"),
    avgHumanReviewTime: integer("avg_human_review_time"),
    securityFindings: integer("security_findings").default(0),
    performanceFindings: integer("performance_findings").default(0),
    styleFindings: integer("style_findings").default(0),
    logicFindings: integer("logic_findings").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index("idx_ai_review_performance_agent").on(table.aiAgentId),
    periodIdx: index("idx_ai_review_performance_period").on(table.periodDate, table.periodType),
    repositoryIdx: index("idx_ai_review_performance_repository").on(table.repository),
    agentRepositoryPeriodUq: unique("ai_review_performance_agent_repo_period_uq").on(
      table.aiAgentId,
      table.repository,
      table.periodDate,
      table.periodType,
    ),
  }),
);
