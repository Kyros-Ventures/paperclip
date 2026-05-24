import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle, XCircle, Shield, Clock } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { jarvisApi, type JarvisHealth } from "../api/jarvis";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function JarvisIntegrationStatus() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "JARVIS Integration" }]);
  }, [setBreadcrumbs]);

  const {
    data: health,
    isLoading,
    error,
    dataUpdatedAt,
  } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), "jarvis-health"],
    queryFn: () => jarvisApi.health(),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Activity} message="Select a company to view JARVIS integration status." />;
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={XCircle}
        message={error instanceof Error ? error.message : "Could not fetch JARVIS integration status."}
      />
    );
  }

  const isHealthy = health?.status === "ok";
  const isConfigured = health?.secretConfigured ?? false;

  const statusCards = [
    {
      label: "Health",
      value: isHealthy ? "Online" : "Degraded",
      icon: isHealthy ? CheckCircle : XCircle,
      color: isHealthy ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400",
      detail: health?.status ?? "unknown",
    },
    {
      label: "Webhook Secret",
      value: isConfigured ? "Configured" : "Not Configured",
      icon: isConfigured ? Shield : XCircle,
      color: isConfigured ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400",
      detail: isConfigured ? "HMAC verification active" : "Webhook endpoint is unprotected",
    },
    {
      label: "Last Checked",
      value: health?.timestamp ? formatTimestamp(health.timestamp) : "Never",
      icon: Clock,
      color: "bg-blue-500/10 text-blue-400",
      detail: dataUpdatedAt ? `Last fetch: ${formatTimestamp(new Date(dataUpdatedAt).toISOString())}` : "Not yet checked",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">JARVIS Integration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Telegram message dispatch and webhook configuration status
          </p>
        </div>
        <Badge variant={isHealthy && isConfigured ? "secondary" : "destructive"} className="gap-1.5 px-3 py-1">
          <Activity className="h-3.5 w-3.5" />
          {isHealthy && isConfigured ? "Operational" : "Needs Attention"}
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {statusCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", card.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Endpoints Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">API Endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
              <Badge variant="outline" className="font-mono text-xs">
                GET
              </Badge>
              <code className="text-sm text-foreground">/api/jarvis/health</code>
              <span className="text-xs text-muted-foreground ml-auto">Health check</span>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
              <Badge variant="outline" className="font-mono text-xs">
                POST
              </Badge>
              <code className="text-sm text-foreground">/api/jarvis/webhook</code>
              <span className="text-xs text-muted-foreground ml-auto">Receive Telegram messages</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
