import { api } from "./client";

// Types from LocalModelStatus.tsx
export interface GitRepo {
  id: string;
  name: string;
  path: string;
  remoteUrl?: string;
  branch: string;
  branches: string[];
  lastCommit: {
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null;
  status: {
    clean: boolean;
    ahead: number;
    behind: number;
    modified: string[];
    untracked: string[];
    staged: string[];
  };
  isDirty: boolean;
}

export interface GitResult {
  success: boolean;
  error?: string;
  output?: string;
  repo?: GitRepo;
}

export interface GitDiffResult {
  success: boolean;
  error?: string;
  diff?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitCommitsResult {
  success: boolean;
  error?: string;
  commits?: GitCommit[];
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  ttl: number;
}

export const gitApi = {
  // Repo listing
  list: (refresh?: boolean) =>
    api.get<GitRepo[]>(`/git/repos${refresh ? "?refresh=true" : ""}`),

  scan: () => api.post<GitRepo[]>("/git/repos/scan", {}),

  // Repo detail
  get: (repoId: string) => api.get<GitRepo>(`/git/repos/${repoId}`),

  refresh: (repoId: string) =>
    api.post<GitRepo>(`/git/repos/${repoId}/refresh`, {}),

  // Git operations
  pull: (repoId: string, branch?: string) =>
    api.post<GitResult>(`/git/repos/${repoId}/pull`, { branch }),

  push: (repoId: string, branch?: string) =>
    api.post<GitResult>(`/git/repos/${repoId}/push`, { branch }),

  fetch: (repoId: string) =>
    api.post<GitResult>(`/git/repos/${repoId}/fetch`, {}),

  // Branch operations
  createBranch: (repoId: string, branchName: string, fromBranch?: string) =>
    api.post<GitResult>(`/git/repos/${repoId}/branches`, {
      branchName,
      fromBranch,
    }),

  createBranchFromStory: (
    repoId: string,
    storyId: string,
    storyTitle: string,
    storyType?: string,
  ) =>
    api.post<GitResult>(`/git/repos/${repoId}/branches/from-story`, {
      storyId,
      storyTitle,
      storyType,
    }),

  checkout: (repoId: string, branchName: string) =>
    api.post<GitResult>(`/git/repos/${repoId}/checkout`, { branchName }),

  // Commit
  commit: (
    repoId: string,
    message: string,
    options?: { addAll?: boolean; files?: string[] },
  ) =>
    api.post<GitResult>(`/git/repos/${repoId}/commit`, {
      message,
      ...options,
    }),

  autoCommitTask: (
    repoId: string,
    taskId: string,
    taskTitle: string,
    changes?: string,
  ) =>
    api.post<GitResult>(`/git/repos/${repoId}/auto-commit-task`, {
      taskId,
      taskTitle,
      changes,
    }),

  // Diff and commits
  getDiff: (repoId: string, staged?: boolean) =>
    api.get<GitDiffResult>(
      `/git/repos/${repoId}/diff${staged ? "?staged=true" : ""}`,
    ),

  getCommits: (repoId: string, limit?: number) =>
    api.get<GitCommitsResult>(
      `/git/repos/${repoId}/commits${limit ? `?limit=${limit}` : ""}`,
    ),

  // Clone
  clone: (url: string, name?: string, targetDir?: string) =>
    api.post<GitResult>("/git/clone", { url, name, targetDir }),

  // Cache
  cacheStats: () => api.get<CacheStats>("/git/cache-stats"),

  clearCache: () => api.post<{ success: boolean }>("/git/clear-cache", {}),
};
