import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { systemHealthApi, type SystemHealthStatus } from "../api/systemHealth";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";

const statusBadgeClass: Record<SystemHealthStatus, string> = {
  healthy: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  degraded: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  unhealthy: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export function HealthChecksTable() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.systemHealth.checks,
    queryFn: () => systemHealthApi.getHealthChecks(),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Health Checks</h3>
        <Button size="xs" variant="ghost" onClick={() => refetch()} aria-label="Refresh health checks">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-label="Loading health checks">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" role="alert">
          <span className="text-sm text-destructive">Failed to load health checks</span>
          <Button size="xs" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState icon={Activity} message="No health checks configured" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="rounded-md border overflow-hidden" role="table" aria-label="System health checks">
          <div role="rowgroup">
            <div
              className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b"
              role="row"
            >
              <span role="columnheader">Component</span>
              <span role="columnheader" className="text-right">Status</span>
              <span role="columnheader" className="text-right">Latency</span>
              <span role="columnheader" className="text-right">Last Run</span>
              <span role="columnheader">Error</span>
            </div>
          </div>
          <div role="rowgroup">
            {data.map((check) => (
              <div
                key={check.component}
                className="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-3 px-3 py-2.5 text-sm border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                role="row"
              >
                <span className="font-medium truncate" role="cell">{check.component}</span>
                <span role="cell">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      statusBadgeClass[check.status],
                    )}
                  >
                    {check.status}
                  </span>
                </span>
                <span className="text-right text-muted-foreground tabular-nums" role="cell">
                  {check.latencyMs != null ? `${check.latencyMs}ms` : "—"}
                </span>
                <span className="text-right text-muted-foreground whitespace-nowrap" role="cell">
                  {check.lastRunAt ? timeAgo(check.lastRunAt) : "—"}
                </span>
                <span
                  className={cn("truncate text-xs", check.errorMessage ? "text-destructive" : "text-muted-foreground")}
                  role="cell"
                  title={check.errorMessage ?? undefined}
                >
                  {check.errorMessage ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
