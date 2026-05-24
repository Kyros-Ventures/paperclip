import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemHealthStatusBanner } from "../components/SystemHealthStatusBanner";
import { HealthChecksTable } from "../components/HealthChecksTable";
import { ResourceUsagePanel } from "../components/ResourceUsagePanel";
import { AgentResourceTable } from "../components/AgentResourceTable";
import { AgentThrottlingPanel } from "../components/AgentThrottlingPanel";
import { timeAgo } from "../lib/timeAgo";

const REFRESH_INTERVAL_MS = 30_000;
const GLOBAL_QUERY_KEYS = [
  queryKeys.systemHealth.health,
  queryKeys.systemHealth.checks,
  queryKeys.systemHealth.resources,
];
const COMPANY_QUERY_KEYS = [
  queryKeys.systemHealth.agentResourceUsage,
  queryKeys.systemHealth.agentThrottling,
];

export function SystemHealthPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "System Health" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    function refresh() {
      setLastUpdated(new Date());
      for (const key of GLOBAL_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      for (const key of COMPANY_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    }

    timerRef.current = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current != null) clearInterval(timerRef.current);
    };
  }, [queryClient]);

  if (!selectedCompanyId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">System Health</h1>
        </div>
        <span className="text-xs text-muted-foreground">
          Auto-refreshes every 30s · Last updated {timeAgo(lastUpdated)}
        </span>
      </div>

      <SystemHealthStatusBanner />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-sm">Health Checks</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <HealthChecksTable />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b py-4">
            <CardTitle className="text-sm">Resource Usage</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ResourceUsagePanel />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-sm">Agent Resource Usage</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <AgentResourceTable companyId={selectedCompanyId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle className="text-sm">Agent Throttling</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <AgentThrottlingPanel companyId={selectedCompanyId} />
        </CardContent>
      </Card>
    </div>
  );
}
