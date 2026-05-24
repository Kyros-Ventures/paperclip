import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Pencil, RefreshCw, X } from "lucide-react";
import { systemHealthApi, type AgentThrottlingRule } from "../api/systemHealth";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "./EmptyState";
import { cn } from "../lib/utils";

interface EditState {
  agentId: string;
  maxConcurrentRuns: string;
  maxRunsPerHour: string;
}

interface AgentThrottlingPanelProps {
  companyId: string;
}

export function AgentThrottlingPanel({ companyId }: AgentThrottlingPanelProps) {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<EditState | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.systemHealth.agentThrottling,
    queryFn: () => systemHealthApi.getAgentThrottling(companyId),
    enabled: !!companyId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ agentId, maxConcurrentRuns, maxRunsPerHour }: {
      agentId: string;
      maxConcurrentRuns: number;
      maxRunsPerHour: number;
    }) => systemHealthApi.updateAgentThrottling(companyId, agentId, { maxConcurrentRuns, maxRunsPerHour }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemHealth.agentThrottling });
      setEditState(null);
    },
  });

  function startEdit(row: AgentThrottlingRule) {
    setEditState({
      agentId: row.agentId,
      maxConcurrentRuns: String(row.maxConcurrentRuns),
      maxRunsPerHour: String(row.maxRunsPerHour),
    });
  }

  function cancelEdit() {
    setEditState(null);
  }

  function saveEdit() {
    if (!editState) return;
    const maxConcurrentRuns = parseInt(editState.maxConcurrentRuns, 10);
    const maxRunsPerHour = parseInt(editState.maxRunsPerHour, 10);
    if (isNaN(maxConcurrentRuns) || isNaN(maxRunsPerHour)) return;
    updateMutation.mutate({ agentId: editState.agentId, maxConcurrentRuns, maxRunsPerHour });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Agent Throttling</h3>
        <Button size="xs" variant="ghost" onClick={() => refetch()} aria-label="Refresh throttling settings">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-label="Loading agent throttling">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" role="alert">
          <span className="text-sm text-destructive">Failed to load throttling settings</span>
          <Button size="xs" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState icon={Bot} message="No agents with throttling configured" />
      )}

      {!isLoading && !error && data && data.length > 0 && (
        <div className="rounded-md border overflow-hidden" role="table" aria-label="Agent throttling settings">
          <div role="rowgroup">
            <div
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b"
              role="row"
            >
              <span role="columnheader">Agent</span>
              <span role="columnheader" className="text-right">Max Concurrent</span>
              <span role="columnheader" className="text-right">Max/Hour</span>
              <span role="columnheader" className="text-right">Current</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" className="sr-only">Actions</span>
            </div>
          </div>
          <div role="rowgroup">
            {data.map((row) => {
              const isEditing = editState?.agentId === row.agentId;
              const isSaving = updateMutation.isPending && updateMutation.variables?.agentId === row.agentId;

              return (
                <div
                  key={row.agentId}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/30 transition-colors items-center"
                  role="row"
                >
                  <span className="flex items-center gap-2 truncate font-medium" role="cell">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    {row.name}
                  </span>

                  {isEditing ? (
                    <>
                      <span role="cell">
                        <Input
                          type="number"
                          min={1}
                          className="h-7 w-20 text-xs text-right"
                          value={editState.maxConcurrentRuns}
                          onChange={(e) => setEditState((s) => s ? { ...s, maxConcurrentRuns: e.target.value } : s)}
                          aria-label="Max concurrent runs"
                          disabled={isSaving}
                        />
                      </span>
                      <span role="cell">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-20 text-xs text-right"
                          value={editState.maxRunsPerHour}
                          onChange={(e) => setEditState((s) => s ? { ...s, maxRunsPerHour: e.target.value } : s)}
                          aria-label="Max runs per hour"
                          disabled={isSaving}
                        />
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-right tabular-nums text-muted-foreground" role="cell">
                        {row.maxConcurrentRuns}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground" role="cell">
                        {row.maxRunsPerHour === 0 ? "∞" : row.maxRunsPerHour}
                      </span>
                    </>
                  )}

                  <span className="text-right tabular-nums text-muted-foreground" role="cell">
                    {row.currentConcurrent}
                  </span>

                  <span role="cell">
                    {row.isThrottled ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">
                        throttled
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </span>

                  <span className="flex items-center justify-end gap-1" role="cell">
                    {isEditing ? (
                      <>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={saveEdit}
                          disabled={isSaving}
                          aria-label="Save throttling settings"
                        >
                          <Check className={cn("h-3 w-3", isSaving && "animate-spin")} />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={isSaving}
                          aria-label="Cancel editing"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => startEdit(row)}
                        disabled={editState !== null}
                        aria-label={`Edit throttling for ${row.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {updateMutation.isError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          Failed to save throttling settings. Please try again.
        </p>
      )}
    </div>
  );
}
