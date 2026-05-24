import { useQuery } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { systemHealthApi, type SystemHealthStatus } from "../api/systemHealth";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";

const healthConfig: Record<
  SystemHealthStatus,
  { icon: typeof CheckCircle; label: string; className: string }
> = {
  healthy: {
    icon: CheckCircle,
    label: "All systems healthy",
    className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300",
  },
  degraded: {
    icon: AlertTriangle,
    label: "System degraded",
    className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-300",
  },
  unhealthy: {
    icon: XCircle,
    label: "System unhealthy",
    className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
  },
};

export function SystemHealthStatusBanner() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.systemHealth.health,
    queryFn: () => systemHealthApi.getHealth(),
  });

  if (isLoading) {
    return <Skeleton className="h-14 w-full rounded-lg" />;
  }

  if (error || !data) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
        role="alert"
        aria-label="System health status: error"
      >
        <div className="flex items-center gap-2.5 text-sm text-destructive">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Could not load system health status</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} aria-label="Retry loading health status">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const config = healthConfig[data.status];
  const Icon = config.icon;

  return (
    <div
      className={cn("flex items-center justify-between gap-3 rounded-lg border px-4 py-3", config.className)}
      role="status"
      aria-label={`System health status: ${data.status}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{config.label}</span>
      </div>
      <span className="text-xs opacity-75">
        Last checked {timeAgo(data.checkedAt)}
      </span>
    </div>
  );
}
