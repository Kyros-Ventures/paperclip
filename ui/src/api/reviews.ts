import { api } from "./client";

export type ReviewType = "ai" | "human";
export type ReviewStatus = "pending" | "in_progress" | "completed" | "skipped";
export type ReviewDecision = "approved" | "rejected" | "changes_requested";

export interface QueueItem {
  id: string;
  issueId: string;
  prUrl: string;
  prNumber: number | null;
  repository: string | null;
  branch: string | null;
  baseBranch: string | null;
  status: ReviewStatus;
  priority: number;
  aiAgentId: string | null;
  humanReviewerId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  finalDecision: string | null;
  type?: ReviewType;
  createdAt: string;
  updatedAt: string;
}

export interface QueueResult {
  success: boolean;
  items: QueueItem[];
  total: number;
  filters: {
    type: ReviewType | null;
    agentId: string | null;
  };
}

export interface CompleteReviewResult {
  success: boolean;
  review: QueueItem;
}

export interface ReviewStatusResult {
  success: boolean;
  review: QueueItem;
}

export const reviewsApi = {
  getQueue: (params?: { type?: ReviewType; agentId?: string }): Promise<QueueResult> => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.agentId) qs.set("agentId", params.agentId);
    const query = qs.toString();
    return api.get(`/reviews/queue${query ? `?${query}` : ""}`);
  },

  completeReview: (
    id: string,
    body: { reviewerId: string; decision: ReviewDecision; notes?: string }
  ): Promise<CompleteReviewResult> =>
    api.post(`/reviews/${id}/complete`, body),

  getStatus: (id: string): Promise<ReviewStatusResult> =>
    api.get(`/reviews/${id}/status`),
};
