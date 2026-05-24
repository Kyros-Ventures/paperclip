import { z } from "zod";

export const localLlmQuantizationSchema = z.enum(["none", "q4_0", "q4_1", "q5_0", "q5_1", "q8_0"]);

export const localLlmConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  modelPath: z.string().optional(),
  modelName: z.string().optional(),
  quantization: localLlmQuantizationSchema.default("none"),
  contextLength: z.number().int().min(512).max(131072).default(4096),
  enabled: z.boolean().default(false),
}).strict();

export const putLocalLlmConfigSchema = localLlmConfigSchema.partial().extend({
  baseUrl: z.string().url().optional(),
});

export const localLlmInferenceSettingsSchema = z.object({
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(0.9),
  topK: z.number().int().min(1).max(200).default(40),
  maxTokens: z.number().int().min(1).max(32768).default(2048),
  repeatPenalty: z.number().min(0.5).max(2).default(1.1),
  seed: z.number().int().optional(),
}).strict();

export const putLocalLlmInferenceSettingsSchema = localLlmInferenceSettingsSchema.partial();

export const loadLocalLlmModelSchema = z.object({
  modelName: z.string().min(1),
}).strict();

export type LocalLlmQuantization = z.infer<typeof localLlmQuantizationSchema>;
export type LocalLlmConfig = z.infer<typeof localLlmConfigSchema>;
export type PutLocalLlmConfig = z.infer<typeof putLocalLlmConfigSchema>;
export type LocalLlmInferenceSettings = z.infer<typeof localLlmInferenceSettingsSchema>;
export type PutLocalLlmInferenceSettings = z.infer<typeof putLocalLlmInferenceSettingsSchema>;
export type LoadLocalLlmModel = z.infer<typeof loadLocalLlmModelSchema>;
