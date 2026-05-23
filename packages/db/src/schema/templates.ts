import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { agents } from "./agents.js";

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").references(() => projects.id),
  name: text("name").notNull(),
  category: text("category").notNull().default("issue"), // issue | epic | project
  description: text("description"),
  body: text("body"), // markdown body with {{variable}} placeholders
  variables: jsonb("variables").$type<string[]>(), // list of template variable names
  createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
