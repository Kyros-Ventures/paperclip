import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { projects } from "./projects";
import { agents } from "./agents";
import { issues } from "./issues";

export const sprints = pgTable("sprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").references(() => projects.id),
  name: text("name").notNull(),
  goal: text("goal"),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  status: text("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sprintStories = pgTable("sprint_stories", {
  id: uuid("id").defaultRandom().primaryKey(),
  sprintId: uuid("sprint_id").notNull().references(() => sprints.id),
  issueId: uuid("issue_id").references(() => issues.id),
  storyPoints: integer("story_points").default(0),
  status: text("status").notNull().default("planned"),
  order: integer("order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stories = pgTable("stories", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  projectId: uuid("project_id").references(() => projects.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("backlog"),
  priority: text("priority").default("medium"),
  assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id),
  storyPoints: integer("story_points").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
