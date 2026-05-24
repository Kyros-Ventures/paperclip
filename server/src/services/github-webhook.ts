/**
 * GitHub Webhook Service
 *
 * Handles GitHub webhook events for Pull Requests:
 * - PR opened: Initial code review trigger
 * - PR synchronized: New commits pushed, re-review needed
 */

// ============================================================================
// Types
// ============================================================================

export interface GitHubPRPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    url: string;
    html_url: string;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    user: { login: string };
    draft: boolean;
    additions: number;
    deletions: number;
    changed_files: number;
  };
  repository: {
    name: string;
    full_name: string;
  };
}

export interface ParsedPRData {
  prNumber: number;
  title: string;
  description: string | null;
  url: string;
  htmlUrl: string;
  branch: string;
  baseBranch: string;
  repository: string;
  repositoryFullName: string;
  headSha: string;
  baseSha: string;
  author: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  diff: string | null;
}

export interface WebhookServiceResult {
  success: boolean;
  data?: ParsedPRData;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function parsePRPayload(payload: GitHubPRPayload): ParsedPRData {
  const pr = payload.pull_request;
  return {
    prNumber: pr.number,
    title: pr.title,
    description: pr.body,
    url: pr.url,
    htmlUrl: pr.html_url,
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    repository: payload.repository.name,
    repositoryFullName: payload.repository.full_name,
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    author: pr.user.login,
    draft: pr.draft,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    diff: null,
  };
}

export async function fetchPRDiff(
  repository: string,
  prNumber: number,
  token: string,
): Promise<string> {
  const url = `https://api.github.com/repos/${repository}/pulls/${prNumber}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github.v3.diff",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Paperclip-AI-Code-Review",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response.text();
}

async function fetchPRDetails(
  repository: string,
  prNumber: number,
  token: string,
): Promise<{ additions: number; deletions: number; changedFiles: number }> {
  const url = `https://api.github.com/repos/${repository}/pulls/${prNumber}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Paperclip-AI-Code-Review",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const pr = (await response.json()) as {
    additions: number;
    deletions: number;
    changed_files: number;
  };
  return {
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}

// ============================================================================
// Service Factory
// ============================================================================

export function createGitHubWebhookService(token: string) {
  async function handlePullRequestOpened(
    payload: GitHubPRPayload,
  ): Promise<WebhookServiceResult> {
    try {
      if (payload.action !== "opened" && payload.action !== "reopened") {
        return {
          success: false,
          error: `Expected action 'opened' or 'reopened', got '${payload.action}'`,
        };
      }

      const parsedData = parsePRPayload(payload);

      if (parsedData.draft) {
        return { success: true, data: { ...parsedData, diff: null } };
      }

      const diff = await fetchPRDiff(
        parsedData.repositoryFullName,
        parsedData.prNumber,
        token,
      );
      const details = await fetchPRDetails(
        parsedData.repositoryFullName,
        parsedData.prNumber,
        token,
      );

      return { success: true, data: { ...parsedData, ...details, diff } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to handle PR opened event: ${errorMessage}`,
      };
    }
  }

  async function handlePullRequestSynchronized(
    payload: GitHubPRPayload,
  ): Promise<WebhookServiceResult> {
    try {
      if (payload.action !== "synchronize") {
        return {
          success: false,
          error: `Expected action 'synchronize', got '${payload.action}'`,
        };
      }

      const parsedData = parsePRPayload(payload);
      const diff = await fetchPRDiff(
        parsedData.repositoryFullName,
        parsedData.prNumber,
        token,
      );
      const details = await fetchPRDetails(
        parsedData.repositoryFullName,
        parsedData.prNumber,
        token,
      );

      return { success: true, data: { ...parsedData, ...details, diff } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to handle PR synchronized event: ${errorMessage}`,
      };
    }
  }

  async function fetchPRDiffBound(
    repository: string,
    prNumber: number,
  ): Promise<string> {
    return fetchPRDiff(repository, prNumber, token);
  }

  return {
    handlePullRequestOpened,
    handlePullRequestSynchronized,
    fetchPRDiff: fetchPRDiffBound,
  };
}

export function createGitHubWebhookServiceFromEnv() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN environment variable is required but not set",
    );
  }
  return createGitHubWebhookService(token);
}
