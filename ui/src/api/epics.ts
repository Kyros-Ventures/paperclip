import { api } from "./client";
import type { IssueStatus, IssuePriority } from "@paperclipai/shared";

// Epic type (mirrors EpicCard's interface for compatibility)
export interface ServerEpic {
  id: string;
  companyId: string;
  goalId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  progress: number;
  parentId: string | null;
  ownerAgentId: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpicSummary {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeAgentId: string | null;
  assigneeAgentName: string | null;
  storyCount: number;
  completedStoryCount: number;
  progressPercent: number;
  sprintId: string | null;
  sprintName: string | null;
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function statusToIssueStatus(s: string): IssueStatus {
  switch (s) {
    case "completed": return "done";
    case "planned": return "backlog";
    case "in_progress": return "in_progress";
    case "cancelled": return "cancelled";
    default: return "backlog";
  }
}

function priorityToIssuePriority(p: number): IssuePriority {
  if (p >= 80) return "critical";
  if (p >= 50) return "high";
  if (p >= 20) return "medium";
  return "low";
}

export function mapServerEpic(e: ServerEpic): EpicSummary {
  return {
    id: e.id,
    identifier: e.id.slice(0, 7).toUpperCase(),
    title: e.title,
    description: e.description,
    status: statusToIssueStatus(e.status),
    priority: priorityToIssuePriority(e.priority),
    assigneeAgentId: e.ownerAgentId,
    assigneeAgentName: null,
    storyCount: 0,
    completedStoryCount: 0,
    progressPercent: e.progress,
    sprintId: null,
    sprintName: null,
    dueDate: e.endDate ? new Date(e.endDate) : null,
    createdAt: new Date(e.createdAt),
    updatedAt: new Date(e.updatedAt),
  };
}

export const epicsApi = {
  list: (companyId: string) =>
    api.get<ServerEpic[]>(`/companies/${companyId}/epics`).then((list) => list.map(mapServerEpic)),

  listRoots: (companyId: string) =>
    api.get<ServerEpic[]>(`/companies/${companyId}/epics/roots`).then((list) => list.map(mapServerEpic)),

  listChildren: (parentId: string) =>
    api.get<ServerEpic[]>(`/epics/${parentId}/children`).then((list) => list.map(mapServerEpic)),

  listByGoal: (goalId: string) =>
    api.get<ServerEpic[]>(`/goals/${goalId}/epics`).then((list) => list.map(mapServerEpic)),

  get: (id: string) =>
    api.get<ServerEpic>(`/epics/${id}`).then(mapServerEpic),

  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<ServerEpic>(`/companies/${companyId}/epics`, data).then(mapServerEpic),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<ServerEpic>(`/epics/${id}`, data).then(mapServerEpic),

  remove: (id: string) =>
    api.delete<ServerEpic>(`/epics/${id}`),

  recalculate: (id: string) =>
    api.post<ServerEpic>(`/epics/${id}/recalculate`, {}).then(mapServerEpic),
};
