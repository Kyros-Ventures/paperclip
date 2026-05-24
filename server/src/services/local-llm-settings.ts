import type { Db } from "@paperclipai/db";
import { localLlmSettings } from "@paperclipai/db";
import {
  localLlmConfigSchema,
  localLlmInferenceSettingsSchema,
  type LocalLlmConfig,
  type LocalLlmInferenceSettings,
  type PutLocalLlmConfig,
  type PutLocalLlmInferenceSettings,
} from "@paperclipai/shared";
import { eq } from "drizzle-orm";

const DEFAULT_SINGLETON_KEY = "default";
const configStorageSchema = localLlmConfigSchema.strip();
const inferenceStorageSchema = localLlmInferenceSettingsSchema.strip();

function normalizeConfig(raw: unknown): LocalLlmConfig {
  const parsed = configStorageSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return configStorageSchema.parse({});
}

function normalizeInferenceSettings(raw: unknown): LocalLlmInferenceSettings {
  const parsed = inferenceStorageSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return inferenceStorageSchema.parse({});
}

export function localLlmSettingsService(db: Db) {
  async function getOrCreateRow() {
    const existing = await db
      .select()
      .from(localLlmSettings)
      .where(eq(localLlmSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    const now = new Date();
    const [created] = await db
      .insert(localLlmSettings)
      .values({
        singletonKey: DEFAULT_SINGLETON_KEY,
        config: {},
        inferenceSettings: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [localLlmSettings.singletonKey],
        set: { updatedAt: now },
      })
      .returning();

    if (created) return created;

    const raced = await db
      .select()
      .from(localLlmSettings)
      .where(eq(localLlmSettings.singletonKey, DEFAULT_SINGLETON_KEY))
      .then((rows) => rows[0] ?? null);
    if (raced) return raced;

    throw new Error("Failed to initialize local LLM settings row");
  }

  return {
    getConfig: async (): Promise<LocalLlmConfig> => {
      const row = await getOrCreateRow();
      return normalizeConfig(row.config);
    },

    updateConfig: async (patch: PutLocalLlmConfig): Promise<LocalLlmConfig> => {
      const current = await getOrCreateRow();
      const next = normalizeConfig({ ...normalizeConfig(current.config), ...patch });
      const now = new Date();
      await db
        .update(localLlmSettings)
        .set({ config: { ...next }, updatedAt: now })
        .where(eq(localLlmSettings.id, current.id));
      return next;
    },

    getInferenceSettings: async (): Promise<LocalLlmInferenceSettings> => {
      const row = await getOrCreateRow();
      return normalizeInferenceSettings(row.inferenceSettings);
    },

    updateInferenceSettings: async (patch: PutLocalLlmInferenceSettings): Promise<LocalLlmInferenceSettings> => {
      const current = await getOrCreateRow();
      const next = normalizeInferenceSettings({
        ...normalizeInferenceSettings(current.inferenceSettings),
        ...patch,
      });
      const now = new Date();
      await db
        .update(localLlmSettings)
        .set({ inferenceSettings: { ...next }, updatedAt: now })
        .where(eq(localLlmSettings.id, current.id));
      return next;
    },
  };
}
