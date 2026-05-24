import { api } from "./client";

export interface AgentScore {
  agentId: string;
  agentName: string;
  totalScore: number;
  breakdown: {
    skillMatch: number;
    workload: number;
    performance: number;
    recency: number;
    complexity: number;
  };
  confidence: "high" | "medium" | "low";
}

export interface AutoAssignResult {
  success: boolean;
  message: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  score?: number;
  alternativeAgents?: AgentScore[];
}

export interface AssignmentRecommendations {
  recommendations: AgentScore[];
  topRecommendation?: AgentScore;
  message?: string;
}

export interface WorkloadAnalytics {
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  overloadedAgents: number;
  averageUtilization: number;
  issuesByAgent: Record<string, number>;
  recommendations: string[];
}

export const assignmentApi = {
  autoAssign: (companyId: string, issueId: string) =>
    api.post<AutoAssignResult>(`/companies/${companyId}/auto-assign`, { issueId }),

  getRecommendations: (companyId: string, issueId: string) =>
    api.get<AssignmentRecommendations>(
      `/companies/${companyId}/assignment-recommendations?issueId=${encodeURIComponent(issueId)}`,
    ),

  getWorkload: (companyId: string) =>
    api.get<WorkloadAnalytics>(`/companies/${companyId}/workload`),
};
