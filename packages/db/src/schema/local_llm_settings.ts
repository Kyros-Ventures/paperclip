import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const localLlmSettings = pgTable(
  "local_llm_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    singletonKey: text("singleton_key").notNull().default("default"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    inferenceSettings: jsonb("inference_settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    singletonKeyIdx: uniqueIndex("local_llm_settings_singleton_key_idx").on(table.singletonKey),
  }),
);
