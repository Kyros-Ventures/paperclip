/**
 * Git Repository Routes
 *
 * GET   /api/git/repos                     — List discovered repositories
 * POST  /api/git/repos/scan                — Scan for git repos in workspace dirs
 * GET   /api/git/repos/:repoId             — Get single repo detail
 * POST  /api/git/repos/:repoId/refresh     — Refresh repo metadata
 * POST  /api/git/repos/:repoId/pull        — Pull from remote
 * POST  /api/git/repos/:repoId/push        — Push to remote
 * POST  /api/git/repos/:repoId/fetch       — Fetch from remote
 * POST  /api/git/repos/:repoId/branches    — Create a new branch
 * POST  /api/git/repos/:repoId/branches/from-story — Create branch from story
 * POST  /api/git/repos/:repoId/checkout    — Checkout a branch
 * POST  /api/git/repos/:repoId/commit      — Commit changes
 * POST  /api/git/repos/:repoId/auto-commit-task — Auto-commit for a task
 * GET   /api/git/repos/:repoId/diff        — Working tree diff
 * GET   /api/git/repos/:repoId/commits     — Commit history
 * POST  /api/git/clone                     — Clone a repository
 * GET   /api/git/cache-stats               — Cache statistics
 * POST  /api/git/clear-cache               — Clear cache
 */

import { Router, type Request, type Response } from "express";
import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

interface GitRepo {
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

interface GitResult {
  success: boolean;
  error?: string;
  output?: string;
  repo?: GitRepo;
}

// ============================================================================
// In-memory repo cache
// ============================================================================

const repoCache = new Map<string, GitRepo>();
let cacheHits = 0;
let cacheMisses = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  repo: GitRepo;
  ts: number;
}

const cacheEntries = new Map<string, CacheEntry>();

// ============================================================================
// Git Helpers
// ============================================================================

function git(cwd: string, args: string[]): string {
  try {
    return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

function gitLines(cwd: string, args: string[]): string[] {
  const out = git(cwd, args);
  return out ? out.split("\n").filter(Boolean) : [];
}

function resolveRepoId(repoPath: string): string {
  return Buffer.from(repoPath).toString("base64").replace(/[/+=]/g, "_").substring(0, 32);
}

function repoName(repoPath: string): string {
  return path.basename(repoPath);
}

function collectRepo(repoPath: string): GitRepo {
  const id = resolveRepoId(repoPath);
  const remoteUrl = git(repoPath, ["config", "--get", "remote.origin.url"]) || undefined;
  const branch = git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const branches = gitLines(repoPath, ["branch", "--format=%(refname:short)"]);

  // Last commit
  const logFmt = "--format=%H||%s||%an||%aI";
  const logLine = git(repoPath, ["log", "-1", logFmt]);
  let lastCommit: GitRepo["lastCommit"] = null;
  if (logLine) {
    const [hash, message, author, date] = logLine.split("||");
    lastCommit = { hash, message, author, date };
  }

  // Status
  const porcelain = gitLines(repoPath, ["status", "--porcelain"]);
  const modified: string[] = [];
  const untracked: string[] = [];
  const staged: string[] = [];
  for (const line of porcelain) {
    const idx = line.substring(0, 2);
    const file = line.substring(3);
    if (idx[0] !== " " && idx[0] !== "?") staged.push(file);
    if (idx[1] === "M") modified.push(file);
    if (idx[0] === "?" && idx[1] === "?") untracked.push(file);
  }

  let ahead = 0;
  let behind = 0;
  if (branch !== "unknown") {
    const ab = git(repoPath, ["rev-list", "--left-right", "--count", `${branch}...@{u}`]);
    if (ab) {
      const [a, b] = ab.split("\t").map(Number);
      ahead = a || 0;
      behind = b || 0;
    }
  }

  return {
    id,
    name: repoName(repoPath),
    path: repoPath,
    remoteUrl,
    branch,
    branches,
    lastCommit,
    status: {
      clean: porcelain.length === 0,
      ahead,
      behind,
      modified,
      untracked,
      staged,
    },
    isDirty: porcelain.length > 0,
  };
}

function getCached(repoPath: string): GitRepo | null {
  const entry = cacheEntries.get(repoPath);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    cacheHits++;
    return entry.repo;
  }
  cacheMisses++;
  return null;
}

function setCached(repoPath: string, repo: GitRepo): void {
  cacheEntries.set(repoPath, { repo, ts: Date.now() });
}

// ============================================================================
// Workspace directories to scan
// ============================================================================

function getWorkspaceDirs(): string[] {
  return [
    "/Users/parth/Documents/Github/paperclip",
    "/Users/parth/Documents/Github/kyros-connect",
    "/Users/parth/Documents/Github/Kyros-Business-OS",
    "/Users/parth/Documents/Github/PCMS",
    "/Users/parth/Documents/Github/kyros-studio",
    "/Users/parth/Documents/Github/legacy",
  ];
}

function scanForRepos(): GitRepo[] {
  const dirs = getWorkspaceDirs();
  const repos: GitRepo[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(path.join(dir, ".git"))) continue;
    const cached = getCached(dir);
    if (cached) {
      repos.push(cached);
    } else {
      const repo = collectRepo(dir);
      if (repo) {
        setCached(dir, repo);
        repos.push(repo);
      }
    }
  }
  return repos;
}

// ============================================================================
// Route Factory
// ============================================================================

export function gitRoutes() {
  const router = Router();

  // GET /api/git/repos — list all repos
  router.get("/repos", (_req: Request, res: Response) => {
    try {
      const repos = scanForRepos();
      res.json(repos);
    } catch (err) {
      logger.error({ error: String(err) }, "git/repos list failed");
      res.status(500).json({ error: "Failed to list repositories" });
    }
  });

  // POST /api/git/repos/scan — force re-scan
  router.post("/repos/scan", (_req: Request, res: Response) => {
    try {
      cacheEntries.clear();
      cacheHits = 0;
      cacheMisses = 0;
      const repos = scanForRepos();
      res.json(repos);
    } catch (err) {
      logger.error({ error: String(err) }, "git/repos scan failed");
      res.status(500).json({ error: "Failed to scan repositories" });
    }
  });

  // GET /api/git/repos/:repoId — single repo detail
  router.get("/repos/:repoId", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      // Refresh as well
      const fresh = collectRepo(repo.path);
      if (fresh) setCached(repo.path, fresh);
      res.json(fresh || repo);
    } catch (err) {
      logger.error({ error: String(err), repoId: req.params.repoId }, "git/repos detail failed");
      res.status(500).json({ error: "Failed to get repository" });
    }
  });

  // POST /api/git/repos/:repoId/refresh — refresh metadata
  router.post("/repos/:repoId/refresh", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const fresh = collectRepo(repo.path);
      if (fresh) setCached(repo.path, fresh);
      res.json(fresh || repo);
    } catch (err) {
      logger.error({ error: String(err), repoId: req.params.repoId }, "git/repos refresh failed");
      res.status(500).json({ error: "Failed to refresh" });
    }
  });

  // POST /api/git/repos/:repoId/pull
  router.post("/repos/:repoId/pull", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const branch = (req.body as { branch?: string })?.branch;
      const args = branch ? ["pull", "origin", branch] : ["pull"];
      const output = git(repo.path, args);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/push
  router.post("/repos/:repoId/push", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const branch = (req.body as { branch?: string })?.branch;
      const args = branch ? ["push", "origin", branch] : ["push"];
      const output = git(repo.path, args);
      res.json({ success: true, output } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/fetch
  router.post("/repos/:repoId/fetch", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const output = git(repo.path, ["fetch", "--all"]);
      res.json({ success: true, output } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/branches — create branch
  router.post("/repos/:repoId/branches", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const { branchName, fromBranch } = req.body as { branchName?: string; fromBranch?: string };
      if (!branchName) {
        res.status(400).json({ error: "branchName is required" });
        return;
      }
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const args = fromBranch
        ? ["checkout", "-b", branchName, fromBranch]
        : ["checkout", "-b", branchName];
      const output = git(repo.path, args);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/branches/from-story — create branch from story
  router.post("/repos/:repoId/branches/from-story", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const { storyId, storyTitle, storyType } = req.body as {
        storyId?: string;
        storyTitle?: string;
        storyType?: string;
      };
      if (!storyId || !storyTitle) {
        res.status(400).json({ error: "storyId and storyTitle are required" });
        return;
      }
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const prefix = storyType ? `${storyType}/` : "feat/";
      const slug = storyTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 40);
      const branchName = `${prefix}${storyId}-${slug}`;
      const output = git(repo.path, ["checkout", "-b", branchName]);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/checkout — checkout branch
  router.post("/repos/:repoId/checkout", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const { branchName } = req.body as { branchName?: string };
      if (!branchName) {
        res.status(400).json({ error: "branchName is required" });
        return;
      }
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const output = git(repo.path, ["checkout", branchName]);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/commit — commit changes
  router.post("/repos/:repoId/commit", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const { message, addAll, files } = req.body as {
        message?: string;
        addAll?: boolean;
        files?: string[];
      };
      if (!message) {
        res.status(400).json({ error: "message is required" });
        return;
      }
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      if (addAll) {
        git(repo.path, ["add", "-A"]);
      } else if (files?.length) {
        git(repo.path, ["add", ...files]);
      }
      const output = git(repo.path, ["commit", "-m", message]);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // POST /api/git/repos/:repoId/auto-commit-task — auto commit for task
  router.post("/repos/:repoId/auto-commit-task", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const { taskId, taskTitle, changes } = req.body as {
        taskId?: string;
        taskTitle?: string;
        changes?: string;
      };
      if (!taskId || !taskTitle) {
        res.status(400).json({ error: "taskId and taskTitle are required" });
        return;
      }
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const message = `feat(${taskId}): ${taskTitle}${changes ? `\n\n${changes}` : ""}`;
      git(repo.path, ["add", "-A"]);
      const output = git(repo.path, ["commit", "-m", message]);
      const updated = collectRepo(repo.path);
      if (updated) setCached(repo.path, updated);
      res.json({ success: true, output, repo: updated } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // GET /api/git/repos/:repoId/diff — working tree diff
  router.get("/repos/:repoId/diff", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const staged = req.query.staged === "true";
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const args = staged ? ["diff", "--staged"] : ["diff"];
      const diff = git(repo.path, args);
      res.json({ success: true, diff });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // GET /api/git/repos/:repoId/commits — commit history
  router.get("/repos/:repoId/commits", (req: Request, res: Response) => {
    try {
      const { repoId } = req.params;
      const limit = Number(req.query.limit) || 20;
      const repos = scanForRepos();
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) {
        res.status(404).json({ error: "Repository not found" });
        return;
      }
      const fmt = "--format=%H||%s||%an||%aI";
      const lines = gitLines(repo.path, ["log", `-${limit}`, fmt]);
      const commits = lines.map((line) => {
        const [hash, message, author, date] = line.split("||");
        return { hash, message, author, date };
      });
      res.json({ success: true, commits });
    } catch (err) {
      res.json({ success: false, error: String(err) });
    }
  });

  // POST /api/git/clone — clone a repository
  router.post("/clone", (req: Request, res: Response) => {
    try {
      const { url, name, targetDir } = req.body as {
        url?: string;
        name?: string;
        targetDir?: string;
      };
      if (!url) {
        res.status(400).json({ error: "url is required" });
        return;
      }
      const dir = targetDir || path.join("/Users/parth/Documents/Github", name || path.basename(url, ".git"));
      const output = execSync(`git clone ${url} ${dir}`, { encoding: "utf-8", timeout: 120_000 });
      const repo = collectRepo(dir);
      if (repo) setCached(dir, repo);
      res.json({ success: true, output: output.trim(), repo } satisfies GitResult);
    } catch (err) {
      res.json({ success: false, error: String(err) } satisfies GitResult);
    }
  });

  // GET /api/git/cache-stats
  router.get("/cache-stats", (_req: Request, res: Response) => {
    res.json({
      size: cacheEntries.size,
      hits: cacheHits,
      misses: cacheMisses,
      ttl: CACHE_TTL_MS,
    });
  });

  // POST /api/git/clear-cache
  router.post("/clear-cache", (_req: Request, res: Response) => {
    cacheEntries.clear();
    cacheHits = 0;
    cacheMisses = 0;
    res.json({ success: true });
  });

  return router;
}
