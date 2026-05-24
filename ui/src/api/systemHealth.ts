import { api } from "./client";

export type SystemHealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceHealth {
  name: string;
  status: SystemHealthStatus;
  latencyMs: number | null;
}

export interface SystemHealth {
  status: SystemHealthStatus;
  services: ServiceHealth[];
  checkedAt: string;
}

export interface HealthCheck {
  component: string;
  status: SystemHealthStatus;
  latencyMs: number | null;
  lastRunAt: string | null;
  errorMessage: string | null;
}

export interface SystemResources {
  cpu: { percent: number };
  memory: { usedMb: number; totalMb: number; percent: number };
  disk: { usedGb: number; totalGb: number; percent: number };
  network: { rxKbps: number; txKbps: number };
}

export interface AgentResourceUsage {
  agentId: string;
  name: string;
  cpuPercent: number;
  memoryMb: number;
}

export interface AgentThrottlingRule {
  agentId: string;
  name: string;
  maxConcurrentRuns: number;
  maxRunsPerHour: number;
  currentConcurrent: number;
  isThrottled: boolean;
}

export interface AgentThrottlingUpdate {
  maxConcurrentRuns?: number;
  maxRunsPerHour?: number;
}

export const systemHealthApi = {
  getHealth: () => api.get<SystemHealth>("/system/health"),

  getHealthChecks: async (): Promise<HealthCheck[]> => {
    const res = await api.get<{ checks: HealthCheck[] }>("/system/health/checks");
    return res.checks;
  },

  getResources: () => api.get<SystemResources>("/system/resources"),

  getAgentResourceUsage: async (companyId: string): Promise<AgentResourceUsage[]> => {
    const res = await api.get<{ agents: AgentResourceUsage[] }>(
      `/companies/${companyId}/agents/resource-usage`,
    );
    return res.agents;
  },

  getAgentThrottling: async (companyId: string): Promise<AgentThrottlingRule[]> => {
    const res = await api.get<{ rules: AgentThrottlingRule[] }>(
      `/companies/${companyId}/agents/throttling`,
    );
    return res.rules;
  },

  updateAgentThrottling: (companyId: string, agentId: string, update: AgentThrottlingUpdate) =>
    api.patch<AgentThrottlingRule>(
      `/companies/${companyId}/agents/throttling/${agentId}`,
      update,
    ),
};
