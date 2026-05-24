import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { systemHealthApi, type AgentResourceUsage } from "../api/systemHealth";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";
import { cn } from "../lib/utils";

type SortField = "name" | "cpuPercent" | "memoryMb";
type SortDir = "asc" | "desc";

function sortRows(rows: AgentResourceUsage[], field: SortField, dir: SortDir): AgentResourceUsage[] {
  return [...rows].sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];
    const cmp = typeof aVal === "string"
      ? aVal.localeCompare(bVal as string)
      : (aVal as number) - (bVal as number);
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronUp className="h-3 w-3 opacity-25" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3" />
    : <ChevronDown className="h-3 w-3" />;
}

interface AgentResourceTableProps {
  companyId: string;
}

export function AgentResourceTable({ companyId }: AgentResourceTableProps) {
  const [sortField, setSortField] = useState<SortField>("cpuPercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.systemHealth.agentResourceUsage,
    queryFn: () => systemHealthApi.getAgentResourceUsage(companyId),
    enabled: !!companyId,
  });

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = data ? sortRows(data, sortField, sortDir) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Agent Resource Usage</h3>
        <Button size="xs" variant="ghost" onClick={() => refetch()} aria-label="Refresh agent resource usage">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-label="Loading agent resource usage">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" role="alert">
          <span className="text-sm text-destructive">Failed to load agent resource usage</span>
          <Button size="xs" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState icon={Bot} message="No agent resource data available" />
      )}

      {!isLoading && !error && sorted.length > 0 && (
        <div className="rounded-md border overflow-hidden" role="table" aria-label="Agent resource usage">
          <div role="rowgroup">
            <div
              className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b"
              role="row"
            >
              <button
                className="flex items-center gap-1 text-left hover:text-foreground transition-colors"
                onClick={() => handleSort("name")}
                role="columnheader"
                aria-sort={sortField === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
              >
                Agent Name
                <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
              </button>
              <button
                className="flex items-center gap-1 justify-end hover:text-foreground transition-colors"
                onClick={() => handleSort("cpuPercent")}
                role="columnheader"
                aria-sort={sortField === "cpuPercent" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
              >
                CPU %
                <SortIcon field="cpuPercent" sortField={sortField} sortDir={sortDir} />
              </button>
              <button
                className="flex items-center gap-1 justify-end hover:text-foreground transition-colors"
                onClick={() => handleSort("memoryMb")}
                role="columnheader"
                aria-sort={sortField === "memoryMb" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
              >
                Memory (MB)
                <SortIcon field="memoryMb" sortField={sortField} sortDir={sortDir} />
              </button>
            </div>
          </div>
          <div role="rowgroup">
            {sorted.map((row) => (
              <div
                key={row.agentId}
                className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2.5 text-sm border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                role="row"
              >
                <span className="flex items-center gap-2 truncate font-medium" role="cell">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  {row.name}
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.cpuPercent >= 80 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground",
                  )}
                  role="cell"
                >
                  {row.cpuPercent.toFixed(1)}%
                </span>
                <span
                  className={cn(
                    "text-right tabular-nums",
                    row.memoryMb >= 1024 ? "text-yellow-600 dark:text-yellow-400 font-medium" : "text-muted-foreground",
                  )}
                  role="cell"
                >
                  {row.memoryMb.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
