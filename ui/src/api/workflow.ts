import { api } from "./client";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowSummary {
  completed: number;
  active: number;
  avg_cycle_time_hours: number;
  sla_breaches: number;
  created_recently: number;
}

export interface StatusBreakdownItem {
  status: string;
  count: number;
}

export interface WorkflowMetrics {
  summary: WorkflowSummary;
  statusBreakdown: StatusBreakdownItem[];
  periodDays: number;
}

export interface SLATimeStats {
  totalTimeInStatus: number;
  averageTimePerStatus: number;
  breached: boolean;
  tier: string;
  currentStatus: string;
  timeInCurrentStatusMinutes: number;
  maxAllowedMinutes: number;
}

export interface AgentWorkload {
  assignedCount: number;
  activeCount: number;
  blockedCount: number;
  reviewCount: number;
  utilizationPercent: number;
}

export interface ReviewQueueItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  timeStats: SLATimeStats;
}

export interface ReviewQueue {
  items: ReviewQueueItem[];
  totalCount: number;
  agentId: string;
}

// ============================================================================
// API Functions
// ============================================================================

export const workflowApi = {
  /** Fetch workflow metrics (SLA breaches, cycle time, status breakdown) */
  getMetrics: (days?: number) =>
    api.get<WorkflowMetrics>(
      `/issues/metrics${days ? `?days=${days}` : ""}`,
    ),

  /** Get SLA time stats for a specific issue */
  getTimeStats: (issueId: string) =>
    api.get<SLATimeStats>(`/issues/${issueId}/time-stats`),

  /** Get agent workload stats */
  getAgentWorkload: (agentId: string) =>
    api.get<AgentWorkload>(`/issues/agents/${agentId}/workload`),

  /** Get review queue for an agent (with SLA info) */
  getReviewQueue: (agentId: string, status?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return api.get<ReviewQueue>(
      `/issues/agents/${agentId}/review-queue${qs ? `?${qs}` : ""}`,
    );
  },

  /** Auto-assign an issue */
  autoAssign: (issueId: string) =>
    api.post<{ autoAssigned: boolean; assignment: Record<string, unknown> }>(
      `/issues/${issueId}/auto-assign`,
      {},
    ),
};
