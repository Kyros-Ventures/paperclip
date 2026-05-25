import type {
  LocalLlmConfig,
  LocalLlmInferenceSettings,
  PutLocalLlmConfig,
  PutLocalLlmInferenceSettings,
} from "@paperclipai/shared";
import { api } from "./client";

export interface LocalLlmModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface LocalLlmModelsResponse {
  models: LocalLlmModel[];
  error?: string | null;
}

export interface LocalLlmTestConnectionResult {
  reachable: boolean;
  baseUrl: string;
  error: string | null;
  testedAt: string;
}

export interface LocalLlmLoadModelResult {
  success: boolean;
  modelName: string;
  loadedAt?: string;
  error?: string;
}

export interface LocalLlmLoadedModel {
  name: string;
  sizeBytes: number;
  expiresAt: string;
}

export type LocalLlmStatus = "unconfigured" | "unreachable" | "reachable" | "loaded";

export interface LocalLlmStatusResponse {
  status: LocalLlmStatus;
  enabled: boolean;
  modelName: string | null;
  loadedModels: LocalLlmLoadedModel[];
  error: string | null;
}

export const localLlmApi = {
  getConfig: () => api.get<LocalLlmConfig>("/llm/config"),
  updateConfig: (patch: PutLocalLlmConfig) => api.put<LocalLlmConfig>("/llm/config", patch),
  testConnection: () => api.post<LocalLlmTestConnectionResult>("/llm/test-connection", {}),
  getModels: () => api.get<LocalLlmModelsResponse>("/llm/models"),
  loadModel: (modelName: string) => api.post<LocalLlmLoadModelResult>("/llm/models/load", { modelName }),
  getStatus: () => api.get<LocalLlmStatusResponse>("/llm/status"),
  getInferenceSettings: () => api.get<LocalLlmInferenceSettings>("/llm/inference-settings"),
  updateInferenceSettings: (patch: PutLocalLlmInferenceSettings) =>
    api.put<LocalLlmInferenceSettings>("/llm/inference-settings", patch),
};
