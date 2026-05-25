import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export interface RuleConditions {
  priority?: string[];
  labels?: string[];
  titleContains?: string;
  descriptionContains?: string;
  parentIssueId?: string;
  projectId?: string;
  goalId?: string;
}

export interface RuleAction {
  assignToAgentId?: string;
  setPriority?: string;
  addLabels?: string[];
  skipAutoAssign?: boolean;
}

export const assignmentRules = pgTable(
  "assignment_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    conditions: jsonb("conditions").$type<RuleConditions>().notNull().default({}),
    action: jsonb("action").$type<RuleAction>().notNull().default({}),
    priority: integer("priority").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEnabledIdx: index("assignment_rules_company_enabled_idx").on(table.companyId, table.enabled),
    priorityIdx: index("assignment_rules_priority_idx").on(table.companyId, table.priority),
  }),
);
