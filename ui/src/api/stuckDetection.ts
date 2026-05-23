import { api } from "./client";

export interface StuckAgent {
  agentId: string;
  taskId: string | null;
  taskType: string | null;
  progress: number;
  status: "stuck" | "failed" | "recovering";
  stuckCount: number;
  escalationLevel: number;
  lastHeartbeat: string;
  minutesSinceHeartbeat: number;
}

export interface StuckAgentsResult {
  companyId: string;
  stuckAgents: StuckAgent[];
  count: number;
}

export interface Escalation {
  id: string;
  agentId: string;
  triggerType: string;
  triggerDetails: Record<string, unknown> | null;
  escalationLevel: number;
  notificationSentAt: string | null;
  resolvedBy: string | null;
  resolutionTimeMinutes: number | null;
  createdAt: string;
}

export interface EscalationsResult {
  companyId: string;
  escalations: Escalation[];
  count: number;
}

export interface RecoverAgentResult {
  success: boolean;
  agentId: string;
  message: string;
  releasedTaskId: string | null;
}

export interface HeartbeatResult {
  success: boolean;
  agentId: string;
  timestamp: string;
}

export const stuckDetectionApi = {
  getStuckAgents: (companyId: string): Promise<StuckAgentsResult> =>
    api.get(`/companies/${companyId}/stuck-agents`),

  recoverAgent: (agentId: string): Promise<RecoverAgentResult> =>
    api.post(`/agents/${agentId}/recover`, {}),

  getEscalations: (
    companyId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<EscalationsResult> => {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return api.get(`/companies/${companyId}/escalations${q ? `?${q}` : ""}`);
  },

  sendHeartbeat: (
    agentId: string,
    payload: {
      companyId: string;
      taskId?: string;
      taskType?: string;
      progress?: number;
    },
  ): Promise<HeartbeatResult> =>
    api.post(`/agents/${agentId}/heartbeat`, payload),
};
