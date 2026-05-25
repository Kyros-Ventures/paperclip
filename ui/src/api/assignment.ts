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

export interface AssignmentRule {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  conditions: RuleConditions;
  action: RuleAction;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleConditions {
  priority?: string[];
  labels?: string[];
  titleContains?: string;
  descriptionContains?: string;
  parentIssueId?: string;
  projectId?: string;
  goalId?: string;
}

export interface RuleAction {
  assignToAgentId?: string;
  setPriority?: string;
  addLabels?: string[];
  skipAutoAssign?: boolean;
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

  getRules: (companyId: string) =>
    api.get<{ data: AssignmentRule[] }>(`/companies/${companyId}/assignment-rules`),

  createRule: (companyId: string, rule: Partial<AssignmentRule>) =>
    api.post<AssignmentRule>(`/companies/${companyId}/assignment-rules`, rule),

  updateRule: (ruleId: string, updates: Partial<AssignmentRule>) =>
    api.patch<AssignmentRule>(`/assignment-rules/${ruleId}`, updates),

  deleteRule: (ruleId: string) =>
    api.delete<{ success: boolean }>(`/assignment-rules/${ruleId}`),
};
