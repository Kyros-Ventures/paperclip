import { api } from "./client";

export interface AIReviewConfig {
  id: string;
  projectId: string;
  repository: string;
  isEnabled: boolean;
  autoReviewPatterns: string[];
  excludePatterns: string[];
  minSeverityThreshold: "critical" | "warning" | "suggestion" | "info";
  requireHumanFor: Record<string, unknown>;
  maxFileSizeKb: number;
  maxTotalSizeKb: number;
  customRules: Record<string, unknown>;
  customPromptOverrides: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AIReviewQueueItem {
  id: string;
  issueId: string;
  prUrl: string;
  prNumber: number;
  repository: string;
  branch: string;
  baseBranch: string;
  status: string;
  triggerType: string;
  priority: number;
  aiAgentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  findingsCount: number;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkPRInput {
  issueId: string;
  prUrl: string;
  prNumber: number;
  repository: string;
  branch: string;
}

export interface AIReviewConfigInput {
  repository: string;
  isEnabled?: boolean;
  autoReviewPatterns?: string[];
  excludePatterns?: string[];
  minSeverityThreshold?: "critical" | "warning" | "suggestion" | "info";
  requireHumanFor?: Record<string, unknown>;
  maxFileSizeKb?: number;
  maxTotalSizeKb?: number;
  customRules?: Record<string, unknown>;
  customPromptOverrides?: Record<string, unknown>;
}

export const githubApi = {
  getConfigs: (projectId: string) =>
    api.get<{ success: boolean; data: AIReviewConfig[] }>(
      `/github/config/${projectId}`,
    ),

  upsertConfig: (projectId: string, input: AIReviewConfigInput) =>
    api.put<{ success: boolean; data: AIReviewConfig }>(
      `/github/config/${projectId}`,
      input,
    ),

  linkPR: (input: LinkPRInput) =>
    api.post<{ success: boolean; data: AIReviewQueueItem }>(
      "/github/link-pr",
      input,
    ),
};
