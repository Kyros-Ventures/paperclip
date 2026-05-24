import { api } from "./client";

export interface JarvisHealth {
  status: string;
  secretConfigured: boolean;
  timestamp: string;
}

export const jarvisApi = {
  health: () => api.get<JarvisHealth>("/jarvis/health"),
};
