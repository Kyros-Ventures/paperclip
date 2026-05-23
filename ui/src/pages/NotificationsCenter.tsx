import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { notificationApi, type NotificationEvent } from "../api/notifications";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils";

const PAGE_LIMIT = 100;

const actionConfig: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  "issue.completed": { label: "Completed", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "issue.created": { label: "Created", icon: Bell, color: "bg-blue-500/10 text-blue-400" },
  "issue.assigned": { label: "Assigned", icon: Bell, color: "bg-blue-500/10 text-blue-400" },
  "issue.blocked": { label: "Blocked", icon: XCircle, color: "bg-red-500/10 text-red-400" },
  "issue.unblocked": { label: "Unblocked", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "agent.activated": { label: "Activated", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "agent.error": { label: "Error", icon: AlertTriangle, color: "bg-red-500/10 text-red-400" },
  "agent.terminated": { label: "Terminated", icon: XCircle, color: "bg-red-500/10 text-red-400" },
  "review.requested": { label: "Review", icon: Bell, color: "bg-yellow-500/10 text-yellow-400" },
  "review.approved": { label: "Approved", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "review.rejected": { label: "Rejected", icon: XCircle, color: "bg-red-500/10 text-red-400" },
  "deployment.started": { label: "Deploying", icon: Clock, color: "bg-blue-500/10 text-blue-400" },
  "deployment.completed": { label: "Deployed", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "deployment.failed": { label: "Failed", icon: XCircle, color: "bg-red-500/10 text-red-400" },
  "goal.completed": { label: "Goal Done", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "approval.requested": { label: "Approval", icon: Bell, color: "bg-yellow-500/10 text-yellow-400" },
  "approval.granted": { label: "Granted", icon: CheckCircle, color: "bg-green-500/10 text-green-400" },
  "approval.denied": { label: "Denied", icon: XCircle, color: "bg-red-500/10 text-red-400" },
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function entityLabel(event: NotificationEvent): string {
  const d = event.details as Record<string, unknown> | null;
  if (event.entityType === "issue") {
    return (d?.identifier as string) ?? (d?.issueIdentifier as string) ?? event.entityId.slice(0, 8);
  }
  if (event.entityType === "agent") return event.agentName ?? event.entityId.slice(0, 8);
  if (event.entityType === "goal") return (d?.goalTitle as string) ?? (d?.title as string) ?? event.entityId.slice(0, 8);
  if (event.entityType === "project") return (d?.projectName as string) ?? (d?.name as string) ?? event.entityId.slice(0, 8);
  return event.entityId.slice(0, 8);
}

function entityTitle(event: NotificationEvent): string | null {
  const d = event.details as Record<string, unknown> | null;
  if (event.entityType === "issue") {
    return (d?.issueTitle as string) ?? (d?.title as string) ?? null;
  }
  return null;
}

export function NotificationsCenter() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Notifications" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), "notifications", { limit: PAGE_LIMIT }],
    queryFn: () => notificationApi.list(selectedCompanyId!, PAGE_LIMIT),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Bell} title="No company selected" description="Select a company to view notifications." />;
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Failed to load notifications"
        description={(error as Error).message}
      />
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="Recent activity will appear here as agents work on issues."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
        <Badge variant="outline" className="text-xs">
          {data.length} events
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.map((event) => {
            const cfg = actionConfig[event.action] ?? { label: event.action, icon: Bell, color: "bg-muted text-muted-foreground" };
            const Icon = cfg.icon;
            const title = entityTitle(event);

            return (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cfg.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.entityType}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {entityLabel(event)}
                    </span>
                  </div>
                  {title && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {title}
                    </p>
                  )}
                  {event.agentName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {event.agentName}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatTime(event.createdAt)}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
