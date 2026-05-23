import { api } from "./client";

function qs(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export interface CycleTimeResult {
  meta: { companyId: string; projectId: string | null; startDate: string; endDate: string; granularity: string };
  summary: { avg: number; p50: number; p75: number; p90: number; p95: number; p99: number; unit: string };
  timeSeries: Array<{ period: string; avg: number; p50: number; p95: number; count: number }>;
  byPriority: Record<string, { avg: number; p50: number; p95: number; count: number }>;
}

export interface ThroughputResult {
  meta: { companyId: string; projectId: string | null; startDate: string; endDate: string; granularity: string };
  summary: { totalCompleted: number; totalCreated: number; avgPerDay: number; avgPerWeek: number; completionRate: number };
  timeSeries: Array<{ period: string; completed: number; created: number; net: number }>;
  cumulative: Array<{ period: string; completed: number }>;
  byStatus: Record<string, number>;
}

export interface AgentPerformanceResult {
  meta: { companyId: string; startDate: string; endDate: string };
  summary: { totalAgents: number; activeAgents: number; avgCompletionRate: number };
  agents: Array<{
    agentId: string; agentName: string; totalTasks: number; completedTasks: number;
    failedTasks: number; averageResponseTime: number; successRate: number;
    lastActive: string; status: string;
  }>;
  timeSeries: unknown[];
  skills: unknown[];
}

export interface BottlenecksResult {
  meta: { companyId: string; generatedAt: string };
  overview: { totalActiveIssues: number; totalStuckIssues: number; avgTimeInCurrentStatus: number };
  byStatus: Array<{ status: string; count: number; avgHours: number }>;
  byProject: Array<{ projectId: string; projectName: string; stuckCount: number }>;
  byAgent: Array<{ agentId: string; agentName: string; stuckCount: number }>;
  recommendations: Array<{ type: string; message: string; severity: string }>;
}

export interface SLAComplianceResult {
  meta: {
    companyId: string; startDate: string; endDate: string;
    slaTiers: Record<string, { maxMinutes: number }>;
  };
  summary: { overallComplianceRate: number; totalBreaches: number; totalIssues: number; avgTimeToBreach: number };
  byPriority: Record<string, { compliant: number; breached: number; rate: number }>;
  byStatus: Record<string, unknown>;
  breaches: Array<{ issueId: string; issueTitle: string; priority: string; breachedAt: string; minutesOverdue: number }>;
  trend: Array<{ period: string; complianceRate: number; breaches: number }>;
}

export interface DashboardResult {
  meta: { companyId: string; generatedAt: string; days: number; cached: boolean };
  summary: {
    totalIssues: number; activeIssues: number; completedIssues: number; cancelledIssues: number;
    avgCycleTimeHours: number; slaComplianceRate: number; completionRate: number;
  };
  metrics: {
    cycleTime: { avg: number; p50: number; p95: number; trend: { direction: string; changePercent: number; metric: string } };
    throughput: { totalCompleted: number; avgPerDay: number; trend: { direction: string; changePercent: number; metric: string } };
    sla: { complianceRate: number; breaches: number; trend: { direction: string; changePercent: number; metric: string } };
    workload: { activeAgents: number; overloadedAgents: number; avgIssuesPerAgent: number };
  };
  alerts: Array<{ type: string; message: string; severity: string }>;
  recentActivity: Array<{ issueId: string; issueTitle: string; event: string; agentName: string; timestamp: string }>;
}

export interface SprintBurndownResult {
  sprintId: string;
  sprintName: string;
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
  burndown: Array<{ date: string; remaining: number; ideal: number }>;
}

export interface SprintVelocityResult {
  sprints: Array<{
    sprintId: string; sprintName: string; status: string;
    committedPoints: number; completedPoints: number; velocity: number;
  }>;
  summary: {
    totalSprints: number; activeSprints: number; completedSprints: number;
    averageVelocity: number; rolling3SprintAverage: number;
  };
}

export const metricsApi = {
  cycleTime: (params: { companyId: string; projectId?: string; startDate?: string; endDate?: string; granularity?: string; priority?: string }) =>
    api.get<CycleTimeResult>(`/metrics/cycle-time${qs(params)}`),

  throughput: (params: { companyId: string; projectId?: string; startDate?: string; endDate?: string; granularity?: string; groupBy?: string }) =>
    api.get<ThroughputResult>(`/metrics/throughput${qs(params)}`),

  summary: (companyId: string) =>
    api.get<Record<string, number>>(`/metrics/summary${qs({ companyId })}`),

  trends: (companyId: string) =>
    api.get<Record<string, unknown>>(`/metrics/trends${qs({ companyId })}`),

  agents: (params: { companyId: string; agentId?: string; startDate?: string; endDate?: string }) =>
    api.get<AgentPerformanceResult & { agents: AgentPerformanceResult["agents"]; topPerformers: AgentPerformanceResult["agents"]; needsAttention: AgentPerformanceResult["agents"] }>(`/metrics/agents${qs(params)}`),

  agentPerformance: (params: { companyId: string; agentId?: string; startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get<AgentPerformanceResult>(`/metrics/agent-performance${qs(params)}`),

  bottlenecks: (params: { companyId: string; projectId?: string; threshold?: number }) =>
    api.get<BottlenecksResult>(`/metrics/bottlenecks${qs(params)}`),

  slaCompliance: (params: { companyId: string; startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get<SLAComplianceResult>(`/metrics/sla-compliance${qs(params)}`),

  dashboard: (params: { companyId: string; days?: number; projectId?: string }) =>
    api.get<DashboardResult>(`/metrics/dashboard${qs(params)}`),

  sprintBurndown: (sprintId: string) =>
    api.get<SprintBurndownResult>(`/metrics/sprint-burndown/${sprintId}`),

  sprintVelocity: (companyId: string) =>
    api.get<SprintVelocityResult>(`/metrics/sprint-velocity${qs({ companyId })}`),

  runSprintMetrics: (companyId: string) =>
    api.post<{ message: string; sprintsProcessed: number }>(`/metrics/sprint-metrics/run${qs({ companyId })}`, {}),
};
