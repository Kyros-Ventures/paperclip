import { api } from "./client";

export interface NotificationEvent {
  id: string;
  companyId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  agentId: string | null;
  agentName: string | null;
  runId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationStatus {
  healthy: boolean;
  lastActivityAt: string | null;
  channels: {
    inApp: { status: string };
    telegram: { status: string };
  };
}

export interface NotificationPreferences {
  companyId: string;
  channels: {
    inApp: { enabled: boolean };
    telegram: { enabled: boolean; chatId: string | null };
  };
  filters: Record<string, boolean>;
}

export const notificationApi = {
  list: (companyId: string, limit?: number) => {
    const params = limit ? `?limit=${limit}` : "";
    return api.get<NotificationEvent[]>(
      `/companies/${companyId}/notifications${params}`,
    );
  },

  status: (companyId: string) =>
    api.get<NotificationStatus>(`/companies/${companyId}/notifications/status`),

  preferences: (companyId: string) =>
    api.get<NotificationPreferences>(
      `/companies/${companyId}/notifications/preferences`,
    ),
};
