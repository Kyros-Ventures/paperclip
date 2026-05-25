import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  FolderGit2,
  Plus,
  Download,
  Upload,
  ArrowUpDown,
  CheckCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Trash2,
  Copy,
  ExternalLink,
  X,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { gitApi, type GitRepo } from "../api/git";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn } from "@/lib/utils";

// ============================================================================
// Status badge colors
// ============================================================================

function StatusBadge({ repo }: { repo: GitRepo }) {
  if (!repo.status.clean) {
    return (
      <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Dirty
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
      <CheckCircle className="h-3 w-3" />
      Clean
    </Badge>
  );
}

function AheadBehind({ ahead, behind }: { ahead: number; behind: number }) {
  if (ahead === 0 && behind === 0) return null;
  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <ArrowUpDown className="h-3 w-3" />
      {ahead > 0 && <span className="text-green-600">+{ahead}</span>}
      {ahead > 0 && behind > 0 && " / "}
      {behind > 0 && <span className="text-red-600">-{behind}</span>}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatHash(hash: string): string {
  return hash.substring(0, 8);
}

// ============================================================================
// Commit history row
// ============================================================================

interface CommitsPanelProps {
  repo: GitRepo;
}

function CommitsPanel({ repo }: CommitsPanelProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["git-commits", repo.id],
    queryFn: () => gitApi.getCommits(repo.id, 20),
    refetchInterval: 60_000,
  });

  const commits = data?.commits ?? [];

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <GitCommit className="h-3.5 w-3.5" />
        Recent Commits
      </h4>
      {isLoading && <p className="text-xs text-muted-foreground">Loading commits…</p>}
      {error && (
        <p className="text-xs text-red-500">
          {error instanceof Error ? error.message : "Failed to load commits"}
        </p>
      )}
      {!isLoading && commits.length === 0 && (
        <p className="text-xs text-muted-foreground">No commits found</p>
      )}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {commits.map((c) => (
          <div key={c.hash} className="flex items-start gap-2 text-xs border-b border-border/50 pb-1.5">
            <code className="text-muted-foreground font-mono shrink-0">{formatHash(c.hash)}</code>
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.message}</p>
              <span className="text-muted-foreground">
                {c.author} · {formatDate(c.date)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Branch list
// ============================================================================

function BranchesPanel({ repo }: { repo: GitRepo }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5" />
        Branches ({repo.branches.length})
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {repo.branches.map((b) => (
          <Badge
            key={b}
            variant={b === repo.branch ? "default" : "outline"}
            className={cn("font-mono text-xs", b === repo.branch && "bg-primary/10 text-primary border-primary/20")}
          >
            {b}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Clone dialog
// ============================================================================

function CloneDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToastActions();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => gitApi.clone(url, name || undefined),
    onSuccess: (result) => {
      if (result.success) {
        addToast({ title: `Cloned ${name || url}`, variant: "success" });
        void queryClient.invalidateQueries({ queryKey: ["git-repos"] });
        onClose();
      } else {
        addToast({ title: "Clone failed", description: result.error, variant: "error" });
      }
    },
    onError: (err) => {
      addToast({ title: "Clone failed", description: err instanceof Error ? err.message : "Unknown error", variant: "error" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border rounded-lg shadow-lg p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Download className="h-4 w-4" />
            Clone Repository
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="clone-url">Repository URL</Label>
            <Input
              id="clone-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-name">Name (optional)</Label>
            <Input id="clone-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="repo-name" className="text-sm" />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!url.trim() || mutation.isPending}>
            {mutation.isPending ? "Cloning…" : "Clone"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Repo action buttons
// ============================================================================

function RepoActions({ repo }: { repo: GitRepo }) {
  const queryClient = useQueryClient();
  const { addToast } = useToastActions();
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [branchName, setBranchName] = useState("");

  const action = (fn: () => Promise<unknown>, label: string) => ({
    mutate: () =>
      fn()
        .then(() => {
          addToast({ title: `${label} succeeded`, variant: "success" });
          void queryClient.invalidateQueries({ queryKey: ["git-repos"] });
        })
        .catch((err) => {
          addToast({ title: `${label} failed`, description: String(err), variant: "error" });
        }),
  });

  const pullMutation = useMutation({
    mutationFn: () => gitApi.pull(repo.id),
    ...action(() => gitApi.pull(repo.id), "Pull"),
  });
  const pushMutation = useMutation({
    mutationFn: () => gitApi.push(repo.id),
    ...action(() => gitApi.push(repo.id), "Push"),
  });
  const fetchMutation = useMutation({
    mutationFn: () => gitApi.fetch(repo.id),
    ...action(() => gitApi.fetch(repo.id), "Fetch"),
  });
  const refreshMutation = useMutation({
    mutationFn: () => gitApi.refresh(repo.id),
    ...action(() => gitApi.refresh(repo.id), "Refresh"),
  });
  const branchMutation = useMutation({
    mutationFn: () => gitApi.createBranch(repo.id, branchName),
    onSuccess: () => {
      addToast({ title: `Created branch ${branchName}`, variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["git-repos"] });
      setShowNewBranch(false);
      setBranchName("");
    },
    onError: (err) => {
      addToast({ title: "Branch creation failed", description: String(err), variant: "error" });
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
        <RefreshCw className={cn("h-3 w-3", refreshMutation.isPending && "animate-spin")} />
        Refresh
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => fetchMutation.mutate()} disabled={fetchMutation.isPending}>
        <Download className="h-3 w-3" />
        Fetch
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => pullMutation.mutate()} disabled={pullMutation.isPending}>
        <GitPullRequest className="h-3 w-3" />
        Pull
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}>
        <Upload className="h-3 w-3" />
        Push
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowNewBranch(!showNewBranch)}>
        <Plus className="h-3 w-3" />
        Branch
      </Button>
      {showNewBranch && (
        <div className="flex items-center gap-1">
          <Input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            placeholder="branch-name"
            className="h-7 text-xs w-36"
            onKeyDown={(e) => {
              if (e.key === "Enter") branchMutation.mutate();
            }}
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => branchMutation.mutate()} disabled={!branchName.trim() || branchMutation.isPending}>
            OK
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function GitReposCenter() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { addToast } = useToastActions();
  const queryClient = useQueryClient();
  const [showClone, setShowClone] = useState(false);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Git Repositories" }]);
  }, [setBreadcrumbs]);

  const { data: repos, isLoading, error } = useQuery({
    queryKey: ["git-repos"],
    queryFn: () => gitApi.list(),
    refetchInterval: 30_000,
  });

  const { data: cacheStats } = useQuery({
    queryKey: ["git-cache-stats"],
    queryFn: () => gitApi.cacheStats(),
    refetchInterval: 60_000,
  });

  const scanMutation = useMutation({
    mutationFn: () => gitApi.scan(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["git-repos"] });
      addToast({ title: "Scan complete", variant: "success" });
    },
    onError: (err) => {
      addToast({ title: "Scan failed", description: String(err), variant: "error" });
    },
  });

  const clearCacheMutation = useMutation({
    mutationFn: () => gitApi.clearCache(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["git-cache-stats"] });
      addToast({ title: "Cache cleared", variant: "success" });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={FolderGit2} message="Select a company to view git repositories." />;
  }

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return <EmptyState icon={AlertTriangle} message={error instanceof Error ? error.message : "Failed to load repositories."} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Git Repositories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage workspace repositories — pull, push, branch, and clone
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cacheStats && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {cacheStats.size} cached
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => clearCacheMutation.mutate()} title="Clear cache">
                <Trash2 className="h-3 w-3" />
              </Button>
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            <RefreshCw className={cn("h-3.5 w-3.5", scanMutation.isPending && "animate-spin")} />
            {scanMutation.isPending ? "Scanning…" : "Scan"}
          </Button>
          <Button variant="default" size="sm" className="gap-1.5" onClick={() => setShowClone(true)}>
            <Download className="h-3.5 w-3.5" />
            Clone
          </Button>
        </div>
      </div>

      {(!repos || repos.length === 0) && (
        <EmptyState icon={FolderGit2} message="No repositories found. Click Scan to discover workspace repos, or Clone to add one." />
      )}

      <div className="space-y-3">
        {repos?.map((repo) => (
          <Card key={repo.id} className={cn("transition-colors", expandedRepo === repo.id && "border-primary/50")}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    className="text-left min-w-0"
                    onClick={() => setExpandedRepo(expandedRepo === repo.id ? null : repo.id)}
                  >
                    <CardTitle className="text-base flex items-center gap-2">
                      <FolderGit2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{repo.name}</span>
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {repo.branch}
                      </code>
                      <AheadBehind ahead={repo.status.ahead} behind={repo.status.behind} />
                      <StatusBadge repo={repo} />
                      {repo.lastCommit && (
                        <span className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {formatDate(repo.lastCommit.date)}
                        </span>
                      )}
                    </CardDescription>
                  </button>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {repo.remoteUrl && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={repo.remoteUrl} onClick={() => navigator.clipboard?.writeText(repo.remoteUrl ?? "")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            {expandedRepo === repo.id && (
              <CardContent className="space-y-4 pt-0">
                <RepoActions repo={repo} />

                {repo.lastCommit && (
                  <div className="text-xs space-y-1">
                    <h4 className="font-medium">Last Commit</h4>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <code className="font-mono bg-muted px-1 rounded">{formatHash(repo.lastCommit.hash)}</code>
                      <span className="truncate">{repo.lastCommit.message}</span>
                    </div>
                    <span className="text-muted-foreground">{repo.lastCommit.author} · {formatDate(repo.lastCommit.date)}</span>
                  </div>
                )}

                {repo.status.modified.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-yellow-600 mb-1">Modified ({repo.status.modified.length})</h4>
                    <div className="flex flex-wrap gap-1">
                      {repo.status.modified.map((f) => (
                        <code key={f} className="text-xs bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded font-mono">{f}</code>
                      ))}
                    </div>
                  </div>
                )}

                {repo.status.untracked.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-red-600 mb-1">Untracked ({repo.status.untracked.length})</h4>
                    <div className="flex flex-wrap gap-1">
                      {repo.status.untracked.map((f) => (
                        <code key={f} className="text-xs bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded font-mono">{f}</code>
                      ))}
                    </div>
                  </div>
                )}

                {repo.status.staged.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-green-600 mb-1">Staged ({repo.status.staged.length})</h4>
                    <div className="flex flex-wrap gap-1">
                      {repo.status.staged.map((f) => (
                        <code key={f} className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded font-mono">{f}</code>
                      ))}
                    </div>
                  </div>
                )}

                <BranchesPanel repo={repo} />
                <CommitsPanel repo={repo} />
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {showClone && <CloneDialog onClose={() => setShowClone(false)} />}
    </div>
  );
}
