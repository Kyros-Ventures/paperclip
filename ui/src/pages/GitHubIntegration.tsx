import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, GitPullRequest, Shield, Settings2, Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { projectsApi } from "../api/projects";
import { githubApi, type AIReviewConfigInput } from "../api/github";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";

const SEVERITY_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "suggestion", label: "Suggestion" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
] as const;

const WEBHOOK_PATH = "/api/github/webhook";

function WebhookInfoCard() {
  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${WEBHOOK_PATH}`
      : WEBHOOK_PATH;

  const secretConfigured = !!import.meta.env.VITE_GITHUB_WEBHOOK_SECRET_SET;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" />
          Webhook Configuration
        </CardTitle>
        <CardDescription>
          Register this URL in your GitHub repository settings under Webhooks.
          Set the content type to <code className="text-xs bg-muted px-1 py-0.5 rounded">application/json</code> and
          select Pull Request events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Webhook URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md border font-mono break-all">
              {webhookUrl}
            </code>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {secretConfigured ? (
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-yellow-500 shrink-0" />
          )}
          <span className={secretConfigured ? "text-green-600" : "text-yellow-600"}>
            {secretConfigured
              ? "GITHUB_WEBHOOK_SECRET is configured"
              : "GITHUB_WEBHOOK_SECRET is not set — set it to enable signature verification"}
          </span>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Required GitHub events: <strong>Pull requests</strong></p>
          <p>
            Set <code className="bg-muted px-1 rounded">GITHUB_WEBHOOK_SECRET</code> and{" "}
            <code className="bg-muted px-1 rounded">GITHUB_TOKEN</code> in your Paperclip
            environment to enable AI code review.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface PatternListProps {
  label: string;
  patterns: string[];
  onChange: (patterns: string[]) => void;
}

function PatternList({ label, patterns, onChange }: PatternListProps) {
  const [newPattern, setNewPattern] = useState("");

  const addPattern = () => {
    const trimmed = newPattern.trim();
    if (trimmed && !patterns.includes(trimmed)) {
      onChange([...patterns, trimmed]);
      setNewPattern("");
    }
  };

  const removePattern = (index: number) => {
    onChange(patterns.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPattern();
            }
          }}
          placeholder="e.g. *.ts or src/**/*.tsx"
          className="text-sm h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addPattern}
          disabled={!newPattern.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {patterns.map((pattern, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="gap-1 pr-1 font-mono text-xs"
          >
            {pattern}
            <button
              type="button"
              onClick={() => removePattern(i)}
              className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        {patterns.length === 0 && (
          <span className="text-xs text-muted-foreground">No patterns configured</span>
        )}
      </div>
    </div>
  );
}

interface RepoConfigFormProps {
  projectId: string;
  initialRepository?: string;
  onDone: () => void;
}

function RepoConfigForm({ projectId, initialRepository, onDone }: RepoConfigFormProps) {
  const queryClient = useQueryClient();
  const { addToast } = useToastActions();

  const [repository, setRepository] = useState(initialRepository ?? "");
  const [isEnabled, setIsEnabled] = useState(true);
  const [minSeverity, setMinSeverity] = useState<AIReviewConfigInput["minSeverityThreshold"]>("suggestion");
  const [maxFileSizeKb, setMaxFileSizeKb] = useState(500);
  const [maxTotalSizeKb, setMaxTotalSizeKb] = useState(5000);
  const [autoReviewPatterns, setAutoReviewPatterns] = useState([
    "*.ts", "*.js", "*.tsx", "*.jsx", "*.py", "*.java", "*.go", "*.rs", "*.sql",
  ]);
  const [excludePatterns, setExcludePatterns] = useState([
    "*.test.ts", "*.spec.ts", "node_modules/*", "dist/*", "build/*",
  ]);

  const { data: existing } = useQuery({
    queryKey: ["github-config", projectId],
    queryFn: () => githubApi.getConfigs(projectId),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!existing?.data) return;
    const config = existing.data.find((c) => c.repository === initialRepository);
    if (!config) return;
    setRepository(config.repository);
    setIsEnabled(config.isEnabled);
    setMinSeverity(config.minSeverityThreshold);
    setMaxFileSizeKb(config.maxFileSizeKb);
    setMaxTotalSizeKb(config.maxTotalSizeKb);
    setAutoReviewPatterns(config.autoReviewPatterns);
    setExcludePatterns(config.excludePatterns);
  }, [existing, initialRepository]);

  const mutation = useMutation({
    mutationFn: (input: AIReviewConfigInput) =>
      githubApi.upsertConfig(projectId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-config", projectId] });
      addToast({ title: "Configuration saved", variant: "success" });
      onDone();
    },
    onError: (err) => {
      addToast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repository.trim()) return;
    mutation.mutate({
      repository: repository.trim(),
      isEnabled,
      minSeverityThreshold: minSeverity,
      maxFileSizeKb,
      maxTotalSizeKb,
      autoReviewPatterns,
      excludePatterns,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="repository">Repository (owner/repo)</Label>
        <Input
          id="repository"
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          placeholder="e.g. acme/my-service"
          disabled={!!initialRepository}
          className="font-mono"
          required
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">AI Review Enabled</p>
          <p className="text-xs text-muted-foreground">
            Automatically review new PRs from this repository
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
      </div>

      <div className="space-y-1.5">
        <Label>Minimum Severity Threshold</Label>
        <Select
          value={minSeverity}
          onValueChange={(v) =>
            setMinSeverity(v as AIReviewConfigInput["minSeverityThreshold"])
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only report findings at or above this severity level
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="maxFileSize">Max File Size (KB)</Label>
          <Input
            id="maxFileSize"
            type="number"
            min={1}
            value={maxFileSizeKb}
            onChange={(e) => setMaxFileSizeKb(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxTotalSize">Max Total PR Size (KB)</Label>
          <Input
            id="maxTotalSize"
            type="number"
            min={1}
            value={maxTotalSizeKb}
            onChange={(e) => setMaxTotalSizeKb(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <PatternList
        label="Review File Patterns"
        patterns={autoReviewPatterns}
        onChange={setAutoReviewPatterns}
      />

      <PatternList
        label="Exclude Patterns"
        patterns={excludePatterns}
        onChange={setExcludePatterns}
      />

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={mutation.isPending || !repository.trim()}
          size="sm"
        >
          {mutation.isPending ? "Saving…" : "Save Configuration"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function GitHubIntegration() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [addingRepo, setAddingRepo] = useState(false);
  const [editingRepo, setEditingRepo] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "GitHub Integration" }]);
  }, [setBreadcrumbs]);

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: [...queryKeys.projects(selectedCompanyId!), "all"],
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  useEffect(() => {
    if (projectsData?.length && !selectedProjectId) {
      setSelectedProjectId(projectsData[0].id);
    }
  }, [projectsData, selectedProjectId]);

  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ["github-config", selectedProjectId],
    queryFn: () => githubApi.getConfigs(selectedProjectId),
    enabled: !!selectedProjectId,
  });

  const configs = configsData?.data ?? [];
  const isLoading = projectsLoading || configsLoading;

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Github}
        message="Select a company to view GitHub integration settings."
      />
    );
  }

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          GitHub Integration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI code review for GitHub pull requests
        </p>
      </div>

      <WebhookInfoCard />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            AI Review Configuration
          </CardTitle>
          <CardDescription>
            Configure which repositories and files to review automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {projectsData && projectsData.length > 0 && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={(v) => {
                  setSelectedProjectId(v);
                  setAddingRepo(false);
                  setEditingRepo(null);
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projectsData.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedProjectId && !addingRepo && editingRepo === null && (
            <>
              {configs.length === 0 ? (
                <div className="py-6 text-center">
                  <GitPullRequest className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No repositories configured yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium font-mono">
                            {config.repository}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Min severity:{" "}
                            <span className="capitalize">
                              {config.minSeverityThreshold}
                            </span>{" "}
                            · Max PR size: {config.maxTotalSizeKb}KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={config.isEnabled ? "secondary" : "outline"}
                          className={
                            config.isEnabled
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : ""
                          }
                        >
                          {config.isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRepo(config.repository)}
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingRepo(true)}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Repository
              </Button>
            </>
          )}

          {selectedProjectId && (addingRepo || editingRepo !== null) && (
            <div className="border rounded-md p-4 bg-muted/20">
              <h3 className="text-sm font-medium mb-4">
                {editingRepo ? `Edit: ${editingRepo}` : "Add Repository"}
              </h3>
              <RepoConfigForm
                projectId={selectedProjectId}
                initialRepository={editingRepo ?? undefined}
                onDone={() => {
                  setAddingRepo(false);
                  setEditingRepo(null);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
