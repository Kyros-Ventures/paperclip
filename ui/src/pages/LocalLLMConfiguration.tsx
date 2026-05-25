import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plug, RefreshCw, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { localLlmApi, type LocalLlmStatus } from "../api/localLlm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "../components/PageSkeleton";

const STATUS_LABELS: Record<LocalLlmStatus, { label: string; className: string }> = {
  unconfigured: { label: "Unconfigured", className: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
  unreachable: { label: "Unreachable", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  reachable: { label: "Reachable", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  loaded: { label: "Loaded", className: "bg-green-500/10 text-green-400 border-green-500/20" },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function LocalLLMConfiguration() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();

  const [baseUrl, setBaseUrl] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("2048");
  const [topP, setTopP] = useState("0.9");

  useEffect(() => {
    setBreadcrumbs([{ label: "Local LLM", href: "/local-llm" }]);
  }, [setBreadcrumbs]);

  // Queries
  const configQ = useQuery({
    queryKey: ["localLlm", "config"],
    queryFn: () => localLlmApi.getConfig(),
  });

  const statusQ = useQuery({
    queryKey: ["localLlm", "status"],
    queryFn: () => localLlmApi.getStatus(),
    refetchInterval: 15_000,
  });

  const modelsQ = useQuery({
    queryKey: ["localLlm", "models"],
    queryFn: () => localLlmApi.getModels(),
    enabled: statusQ.data?.status === "reachable" || statusQ.data?.status === "loaded",
  });

  const inferenceSettingsQ = useQuery({
    queryKey: ["localLlm", "inferenceSettings"],
    queryFn: () => localLlmApi.getInferenceSettings(),
  });

  // Sync config to local state
  useEffect(() => {
    if (configQ.data) {
      setBaseUrl(configQ.data.baseUrl ?? "");
    }
  }, [configQ.data]);

  useEffect(() => {
    if (inferenceSettingsQ.data) {
      setTemperature(String(inferenceSettingsQ.data.temperature ?? 0.7));
      setMaxTokens(String(inferenceSettingsQ.data.maxTokens ?? 2048));
      setTopP(String(inferenceSettingsQ.data.topP ?? 0.9));
    }
  }, [inferenceSettingsQ.data]);

  // Mutations
  const saveConfig = useMutation({
    mutationFn: () => localLlmApi.updateConfig({ baseUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["localLlm"] });
      pushToast({ title: "Configuration saved", tone: "success" });
    },
    onError: (err: Error) => pushToast({ title: err.message, tone: "error" }),
  });

  const testConn = useMutation({
    mutationFn: () => localLlmApi.testConnection(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["localLlm"] });
      if (result.reachable) {
        pushToast({ title: `Connected to ${result.baseUrl}`, tone: "success" });
      } else {
        pushToast({ title: result.error ?? "Connection failed", tone: "error" });
      }
    },
    onError: (err: Error) => pushToast({ title: err.message, tone: "error" }),
  });

  const loadModelMut = useMutation({
    mutationFn: (name: string) => localLlmApi.loadModel(name),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["localLlm"] });
      if (result.success) {
        pushToast({ title: `Model "${result.modelName}" loaded`, tone: "success" });
      } else {
        pushToast({ title: result.error ?? "Failed to load model", tone: "error" });
      }
    },
    onError: (err: Error) => pushToast({ title: err.message, tone: "error" }),
  });

  const saveInference = useMutation({
    mutationFn: () =>
      localLlmApi.updateInferenceSettings({
        temperature: parseFloat(temperature) || 0.7,
        maxTokens: parseInt(maxTokens, 10) || 2048,
        topP: parseFloat(topP) || 0.9,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["localLlm"] });
      pushToast({ title: "Inference settings saved", tone: "success" });
    },
    onError: (err: Error) => pushToast({ title: err.message, tone: "error" }),
  });

  const isLoading = configQ.isLoading || statusQ.isLoading;

  if (isLoading) return <PageSkeleton />;

  const status = statusQ.data;
  const models = modelsQ.data;

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Local LLM Configuration</h1>
      <p className="text-sm text-muted-foreground">
        Configure Ollama or compatible local LLM endpoint for AI-powered features.
      </p>

      {/* Status Banner */}
      {status && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          <Badge className={STATUS_LABELS[status.status]?.className ?? ""} variant="outline">
            {STATUS_LABELS[status.status]?.label ?? status.status}
          </Badge>
          {status.modelName && (
            <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
              {status.modelName}
            </Badge>
          )}
        </div>
      )}

      {/* Connection Config */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connection
          </CardTitle>
          <CardDescription>Configure the local LLM endpoint URL (Ollama, LM Studio, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Base URL</Label>
            <Input
              className="h-8 text-sm font-mono"
              placeholder="http://localhost:11434"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
              {saveConfig.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Config
            </Button>
            <Button size="sm" variant="outline" onClick={() => testConn.mutate()} disabled={testConn.isPending || !baseUrl}>
              {testConn.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plug className="h-3 w-3 mr-1" />}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Available Models */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Available Models
          </CardTitle>
          <CardDescription>
            Models available on the local server. Load one to use for AI code review and agent tasks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelsQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading models...
            </div>
          ) : models?.models && models.models.length > 0 ? (
            <div className="rounded-md border border-border divide-y divide-border">
              {models.models.map((m) => (
                <div key={m.name} className="flex items-center justify-between p-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.details?.parameter_size ?? "?"} &middot; {m.details?.quantization_level ?? "?"} &middot;{" "}
                      {formatBytes(m.size)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadModelMut.mutate(m.name)}
                    disabled={loadModelMut.isPending}
                  >
                    {loadModelMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Load
                  </Button>
                </div>
              ))}
            </div>
          ) : models?.error ? (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="h-3 w-3" /> {models.error}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {status?.status === "reachable" || status?.status === "loaded"
                ? "No models found on the server."
                : "Connect to a local server to see available models."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loaded Models */}
      {status?.loadedModels && status.loadedModels.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" /> Loaded Models
            </CardTitle>
            <CardDescription>Currently loaded and ready for inference.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border divide-y divide-border">
              {status.loadedModels.map((lm) => (
                <div key={lm.name} className="flex items-center justify-between p-2 text-sm">
                  <span className="font-medium">{lm.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(lm.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inference Settings */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Inference Settings
          </CardTitle>
          <CardDescription>Configure model parameters for AI-powered features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature</Label>
              <Input
                className="h-8 text-sm font-mono"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="0.7"
              />
              <p className="text-[10px] text-muted-foreground">0-2. Higher = more creative</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Tokens</Label>
              <Input
                className="h-8 text-sm font-mono"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder="2048"
              />
              <p className="text-[10px] text-muted-foreground">256-8192</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Top P</Label>
              <Input
                className="h-8 text-sm font-mono"
                value={topP}
                onChange={(e) => setTopP(e.target.value)}
                placeholder="0.9"
              />
              <p className="text-[10px] text-muted-foreground">0-1. Nucleus sampling</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={() => saveInference.mutate()}
            disabled={saveInference.isPending}
          >
            {saveInference.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Save Settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
