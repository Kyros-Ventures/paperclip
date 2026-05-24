import { useQuery } from "@tanstack/react-query";
import { Cpu, HardDrive, MemoryStick, Network, RefreshCw } from "lucide-react";
import { systemHealthApi } from "../api/systemHealth";
import { queryKeys } from "../lib/queryKeys";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";

function formatKbps(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(1)} Gbps`;
  if (kbps >= 1_000) return `${(kbps / 1_000).toFixed(1)} Mbps`;
  return `${kbps.toFixed(0)} Kbps`;
}

function gaugeColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-yellow-500";
  return "bg-green-500";
}

interface GaugeBarProps {
  label: string;
  icon: typeof Cpu;
  value: number;
  subtitle?: string;
}

function GaugeBar({ label, icon: Icon, value, subtitle }: GaugeBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
          {subtitle && <span className="text-xs opacity-60">{subtitle}</span>}
        </div>
        <span className="text-sm font-semibold tabular-nums">{value.toFixed(1)}%</span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${value.toFixed(1)}%`}
      >
        <div
          className={cn("h-full rounded-full transition-all", gaugeColor(clamped))}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function ResourceUsagePanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.systemHealth.resources,
    queryFn: () => systemHealthApi.getResources(),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Resource Usage</h3>
        <Button size="xs" variant="ghost" onClick={() => refetch()} aria-label="Refresh resource usage">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-4" aria-label="Loading resource usage">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5" role="alert">
          <span className="text-sm text-destructive">Failed to load resource usage</span>
          <Button size="xs" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !error && data && (
        <div className="space-y-4">
          <GaugeBar label="CPU" icon={Cpu} value={data.cpu.percent} />
          <GaugeBar
            label="Memory"
            icon={MemoryStick}
            value={data.memory.percent}
            subtitle={`${data.memory.usedMb} / ${data.memory.totalMb} MB`}
          />
          <GaugeBar
            label="Disk"
            icon={HardDrive}
            value={data.disk.percent}
            subtitle={data.disk.totalGb > 0 ? `${data.disk.usedGb.toFixed(1)} / ${data.disk.totalGb.toFixed(1)} GB` : undefined}
          />
          <div className="pt-1 flex items-center gap-2 text-sm">
            <Network className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-muted-foreground">Network I/O</span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              <span title="Receive">↓ {formatKbps(data.network.rxKbps)}</span>
              {" · "}
              <span title="Transmit">↑ {formatKbps(data.network.txKbps)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
