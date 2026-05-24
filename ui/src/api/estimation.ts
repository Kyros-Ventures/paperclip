import { api } from "./client";

export interface EstimationConfig {
  method: "cycle_time" | "story_points" | "hybrid";
  enabled: boolean;
  lookbackDays: number;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  updatedAt: string | null;
}

export interface EstimationRecord {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeAgentName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cycleTimeHours: number | null;
  estimatedHours: number | null;
  accuracyPercent: number | null;
}

export interface EstimationHistory {
  records: EstimationRecord[];
  summary: {
    totalCompleted: number;
    avgCycleTimeHours: number | null;
    byPriority: Record<string, { count: number; avgCycleTimeHours: number | null }>;
  };
}

export const estimationApi = {
  getConfig: (companyId: string) =>
    api.get<EstimationConfig>(`/companies/${companyId}/estimation/config`),

  getHistory: (companyId: string, params?: { limit?: number; days?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.days) qs.set("days", String(params.days));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<EstimationHistory>(`/companies/${companyId}/estimation/history${query}`);
  },
};
