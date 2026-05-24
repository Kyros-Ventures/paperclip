import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { assignmentApi, type AgentScore } from "../api/assignment";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-green-500/10 text-green-400 border-green-500/20",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  low: "bg-red-500/10 text-red-400 border-red-500/20",
};

function ScoreBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-muted-foreground capitalize">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

function AgentRecommendationRow({
  rec,
  rank,
}: {
  rec: AgentScore;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 py-2.5 px-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="w-5 shrink-0 text-xs font-mono text-muted-foreground/60">
          #{rank}
        </span>
        <span className="flex-1 text-sm font-medium truncate">{rec.agentName}</span>
        <Badge className={cn("text-xs capitalize", CONFIDENCE_COLORS[rec.confidence])}>
          {rec.confidence}
        </Badge>
        <span className="w-12 text-right font-mono text-xs text-muted-foreground">
          {Math.round(rec.totalScore * 100)}%
        </span>
        {expanded ? (
          <ChevronUp className="size-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 bg-muted/10">
          <ScoreBar value={rec.breakdown.skillMatch} label="Skill match" />
          <ScoreBar value={rec.breakdown.workload} label="Workload" />
          <ScoreBar value={rec.breakdown.performance} label="Performance" />
          <ScoreBar value={rec.breakdown.recency} label="Recency" />
          <ScoreBar value={rec.breakdown.complexity} label="Complexity" />
        </div>
      )}
    </div>
  );
}

export function AssignmentEngine() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [issueId, setIssueId] = useState("");
  const [lookupIssueId, setLookupIssueId] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Assignment Engine" }]);
  }, [setBreadcrumbs]);

  const {
    data: workload,
    isLoading: workloadLoading,
    error: workloadError,
  } = useQuery({
    queryKey: ["assignment", "workload", selectedCompanyId],
    queryFn: () => assignmentApi.getWorkload(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const {
    data: recommendations,
    isLoading: recLoading,
  } = useQuery({
    queryKey: ["assignment", "recommendations", selectedCompanyId, lookupIssueId],
    queryFn: () => assignmentApi.getRecommendations(selectedCompanyId!, lookupIssueId),
    enabled: !!selectedCompanyId && !!lookupIssueId,
  });

  const autoAssignMutation = useMutation({
    mutationFn: (id: string) => assignmentApi.autoAssign(selectedCompanyId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assignment", "workload"] });
    },
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Users}
        message="Select a company to view the Assignment Engine."
      />
    );
  }

  if (workloadLoading) return <PageSkeleton />;

  if (workloadError) {
    const msg = workloadError instanceof Error ? workloadError.message : "Could not load workload data.";
    return <EmptyState icon={XCircle} message={msg} />;
  }

  const summaryCards = [
    {
      label: "Total Agents",
      value: workload?.totalAgents ?? 0,
      icon: Users,
      color: "bg-blue-500/10 text-blue-400",
    },
    {
      label: "Available",
      value: workload?.availableAgents ?? 0,
      icon: CheckCircle,
      color: "bg-green-500/10 text-green-400",
    },
    {
      label: "Busy",
      value: workload?.busyAgents ?? 0,
      icon: BarChart2,
      color: "bg-yellow-500/10 text-yellow-400",
    },
    {
      label: "Overloaded",
      value: workload?.overloadedAgents ?? 0,
      icon: AlertTriangle,
      color:
        (workload?.overloadedAgents ?? 0) > 0
          ? "bg-red-500/10 text-red-400"
          : "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Assignment Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Workload distribution, auto-assignment, and agent recommendations.
        </p>
      </div>

      {/* Summary */}
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
                  <div className="text-sm font-semibold">{card.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Utilization */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Average Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold font-mono">
                {workload?.averageUtilization ?? 0}%
              </span>
              <span className="text-xs text-muted-foreground mb-1">across all agents</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  (workload?.averageUtilization ?? 0) >= 80
                    ? "bg-red-500"
                    : (workload?.averageUtilization ?? 0) >= 50
                      ? "bg-yellow-500"
                      : "bg-green-500",
                )}
                style={{ width: `${workload?.averageUtilization ?? 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            {!workload?.recommendations.length ? (
              <p className="text-xs text-muted-foreground">No recommendations at this time.</p>
            ) : (
              <ul className="space-y-1.5">
                {workload.recommendations.map((rec) => (
                  <li key={rec} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-yellow-400" />
                    {rec}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auto-Assign Panel */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="size-4" />
            Auto-Assign Issue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Enter an issue ID to auto-assign it to the best available agent.
          </p>
          <div className="flex gap-2">
            <Input
              className="h-8 text-sm"
              placeholder="Issue ID (e.g. uuid)"
              value={issueId}
              onChange={(e) => setIssueId(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!issueId.trim() || autoAssignMutation.isPending}
              onClick={() => autoAssignMutation.mutate(issueId.trim())}
            >
              {autoAssignMutation.isPending ? "Assigning…" : "Auto-Assign"}
            </Button>
          </div>
          {autoAssignMutation.data && (
            <div
              className={cn(
                "rounded-md p-3 text-xs",
                autoAssignMutation.data.success
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400",
              )}
            >
              {autoAssignMutation.data.message}
              {autoAssignMutation.data.alternativeAgents?.length ? (
                <div className="mt-2 space-y-1">
                  <div className="font-medium">Suggested alternatives:</div>
                  {autoAssignMutation.data.alternativeAgents.map((a) => (
                    <div key={a.agentId} className="flex justify-between">
                      <span>{a.agentName}</span>
                      <span className="font-mono">{Math.round(a.totalScore * 100)}%</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {autoAssignMutation.isError && (
            <div className="rounded-md p-3 text-xs bg-red-500/10 text-red-400">
              {autoAssignMutation.error instanceof Error
                ? autoAssignMutation.error.message
                : "Auto-assignment failed."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations lookup */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Agent Recommendations for Issue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Score all agents for a specific issue to see ranked recommendations.
          </p>
          <div className="flex gap-2">
            <Input
              className="h-8 text-sm"
              placeholder="Issue ID"
              value={issueId}
              onChange={(e) => setIssueId(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!issueId.trim()}
              onClick={() => setLookupIssueId(issueId.trim())}
            >
              Score Agents
            </Button>
          </div>

          {recLoading && lookupIssueId && (
            <div className="text-xs text-muted-foreground">Scoring agents…</div>
          )}

          {recommendations?.message && (
            <div className="text-xs text-muted-foreground">{recommendations.message}</div>
          )}

          {recommendations?.recommendations && recommendations.recommendations.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              {recommendations.recommendations.map((rec, idx) => (
                <AgentRecommendationRow key={rec.agentId} rec={rec} rank={idx + 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
