import { api } from "./client";

export type DependencyType = "blocks" | "blocked-by" | "relates-to";

export interface DependencyEdge {
  id: string;
  issueId: string;
  dependsOnId: string;
  dependencyType: DependencyType;
  createdAt: string;
  issueTitle?: string;
  issueStatus?: string;
  issueIdentifier?: string | null;
  dependsOnTitle?: string;
  dependsOnStatus?: string;
  dependsOnIdentifier?: string | null;
}

export interface DependenciesResult {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  count: number;
  dependencies: DependencyEdge[];
}

export interface DependentsResult {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  count: number;
  dependents: DependencyEdge[];
}

export interface TransitiveResult {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  count: number;
  dependencies: DependencyEdge[];
}

export interface BlockersResult {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  hasUnresolvedBlockers: boolean;
  count: number;
  blockers: DependencyEdge[];
}

export interface BlockedResult {
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  count: number;
  blocked: DependencyEdge[];
}

export interface CycleCheckResult {
  issueId: string;
  dependsOnId: string;
  wouldCreateCycle: boolean;
  safe: boolean;
}

export interface AddDependencyResult {
  success: boolean;
  dependency: DependencyEdge;
}

export const dependenciesApi = {
  getDependencies: (issueId: string): Promise<DependenciesResult> =>
    api.get(`/issues/${issueId}/dependencies`),

  getDependents: (issueId: string): Promise<DependentsResult> =>
    api.get(`/issues/${issueId}/dependents`),

  getTransitive: (issueId: string, includeRelated = false): Promise<TransitiveResult> =>
    api.get(`/issues/${issueId}/dependencies/transitive${includeRelated ? "?includeRelated=true" : ""}`),

  getBlockers: (issueId: string): Promise<BlockersResult> =>
    api.get(`/issues/${issueId}/dependencies/blockers`),

  getBlocked: (issueId: string): Promise<BlockedResult> =>
    api.get(`/issues/${issueId}/dependents/blocked`),

  addDependency: (
    issueId: string,
    data: { dependsOnId: string; dependencyType: DependencyType },
  ): Promise<AddDependencyResult> => api.post(`/issues/${issueId}/dependencies`, data),

  removeDependency: (issueId: string, depId: string): Promise<{ success: boolean; message: string }> =>
    api.delete(`/issues/${issueId}/dependencies/${depId}`),

  checkCycle: (issueId: string, dependsOnId: string): Promise<CycleCheckResult> =>
    api.post(`/issues/${issueId}/dependencies/check-cycle`, { dependsOnId }),
};
