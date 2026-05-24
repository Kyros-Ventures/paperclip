import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle, Clock, TrendingUp, AlertTriangle, XCircle } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { estimationApi, type EstimationRecord } from "../api/estimation";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

function formatHours(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function AccuracyBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground text-xs">—</span>;
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    clamped >= 80
      ? "bg-green-500/10 text-green-400"
      : clamped >= 50
        ? "bg-yellow-500/10 text-yellow-400"
        : "bg-red-500/10 text-red-400";
  return <Badge className={cn("text-xs font-mono", color)}>{clamped}%</Badge>;
}

function HistoryRow({ record }: { record: EstimationRecord }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-2 px-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
        {record.issueIdentifier}
      </td>
      <td className="py-2 px-3 text-sm max-w-xs">
        <span className="line-clamp-1">{record.issueTitle}</span>
      </td>
      <td className="py-2 px-3">
        <Badge className={cn("text-xs capitalize", PRIORITY_COLORS[record.priority] ?? "bg-muted text-muted-foreground")}>
          {record.priority}
        </Badge>
      </td>
      <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {record.assigneeAgentName ?? record.assigneeAgentId?.slice(0, 8) ?? "—"}
      </td>
      <td className="py-2 px-3 text-xs font-mono whitespace-nowrap">
        {formatHours(record.cycleTimeHours)}
      </td>
      <td className="py-2 px-3 text-xs font-mono whitespace-nowrap">
        {formatHours(record.estimatedHours)}
      </td>
      <td className="py-2 px-3">
        <AccuracyBadge pct={record.accuracyPercent} />
      </td>
      <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatDate(record.completedAt)}
      </td>
    </tr>
  );
}

export function EstimationEngine() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Estimation Engine" }]);
  }, [setBreadcrumbs]);

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useQuery({
    queryKey: ["estimation", "config", selectedCompanyId],
    queryFn: () => estimationApi.getConfig(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useQuery({
    queryKey: ["estimation", "history", selectedCompanyId],
    queryFn: () => estimationApi.getHistory(selectedCompanyId!, { limit: 100, days: 30 }),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={BarChart3}
        message="Select a company to view the Estimation Engine."
      />
    );
  }

  if (configLoading || historyLoading) return <PageSkeleton />;

  if (configError || historyError) {
    const msg =
      (configError instanceof Error ? configError.message : null) ??
      (historyError instanceof Error ? historyError.message : null) ??
      "Could not load estimation data.";
    return <EmptyState icon={XCircle} message={msg} />;
  }

  const summary = history?.summary;

  const summaryCards = [
    {
      label: "Completed (30d)",
      value: summary?.totalCompleted ?? 0,
      icon: CheckCircle,
      color: "bg-green-500/10 text-green-400",
    },
    {
      label: "Avg Cycle Time",
      value: formatHours(summary?.avgCycleTimeHours ?? null),
      icon: Clock,
      color: "bg-blue-500/10 text-blue-400",
    },
    {
      label: "Method",
      value: config?.method === "cycle_time"
        ? "Cycle Time"
        : config?.method === "story_points"
          ? "Story Points"
          : "Hybrid",
      icon: TrendingUp,
      color: "bg-purple-500/10 text-purple-400",
    },
    {
      label: "Status",
      value: config?.enabled ? "Active" : "Disabled",
      icon: config?.enabled ? CheckCircle : AlertTriangle,
      color: config?.enabled ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400",
    },
  ];

  const priorityOrder = ["critical", "high", "medium", "low"] as const;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Estimation Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Task cycle time analysis and estimation accuracy tracking.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("rounded-lg p-2", card.color)}>
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{card.label}</div>
                  <div className="text-sm font-semibold">{String(card.value)}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Config + Priority Breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span className="capitalize font-mono text-xs">{config?.method ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lookback Window</span>
              <span className="font-mono text-xs">{config?.lookbackDays ?? 30}d</span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="text-xs text-muted-foreground mb-1">Priority Weights</div>
              {priorityOrder.map((p) => (
                <div key={p} className="flex justify-between text-xs py-0.5">
                  <span className="capitalize text-muted-foreground">{p}</span>
                  <span className="font-mono">
                    ×{config?.priorityWeights[p] ?? "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cycle Time by Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {priorityOrder.map((p) => {
              const data = summary?.byPriority[p];
              return (
                <div key={p} className="flex items-center justify-between text-sm">
                  <Badge className={cn("text-xs capitalize", PRIORITY_COLORS[p] ?? "bg-muted")}>
                    {p}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {data ? (
                      <>
                        <span className="font-mono">{formatHours(data.avgCycleTimeHours)}</span>
                        <span className="ml-1 text-muted-foreground/60">avg</span>
                        <span className="ml-2 font-mono">{data.count}</span>
                        <span className="ml-1 text-muted-foreground/60">tasks</span>
                      </>
                    ) : (
                      <span>No data</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Estimation History (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!history?.records.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No completed issues with cycle time data in the last 30 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">ID</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Title</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Priority</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Actual</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Estimate</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Accuracy</th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {history.records.map((record) => (
                    <HistoryRow key={record.issueId} record={record} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
