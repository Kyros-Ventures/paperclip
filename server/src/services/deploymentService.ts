/**
 * Deployment Service
 *
 * In-memory deployment tracking for staging and production deployments.
 * Tracks deploy state through: deploying → live → rolling_back → rolled_back.
 */

export interface Deployment {
  id: string;
  repo: string;
  branch?: string;
  status: "deploying" | "live" | "failed" | "rolling_back" | "rolled_back";
  environment: "staging" | "production";
  requestedBy?: string;
  approver?: string;
  stagingDeployId?: string;
  createdAt: string;
  updatedAt: string;
}

const deployments = new Map<string, Deployment>();
let idCounter = 0;

function nextId(): string {
  idCounter++;
  return `deploy-${idCounter}`;
}

export const deploymentService = {
  deployToStaging(repo: string, branch: string): Deployment {
    const deployment: Deployment = {
      id: nextId(),
      repo,
      branch,
      status: "deploying",
      environment: "staging",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    deployments.set(deployment.id, deployment);
    return deployment;
  },

  requestProductionApproval(requestedBy: string): { approved: boolean } {
    return { approved: true };
  },

  deployToProduction(
    repo: string,
    stagingDeployId: string,
    approver: string,
  ): Deployment {
    const deployment: Deployment = {
      id: nextId(),
      repo,
      status: "live",
      environment: "production",
      stagingDeployId,
      approver,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    deployments.set(deployment.id, deployment);
    return deployment;
  },

  rollback(): void {
    // No-op in in-memory implementation
  },

  getDeployment(id: string): Deployment | undefined {
    return deployments.get(id);
  },

  listDeployments(repo?: string): Deployment[] {
    const all = Array.from(deployments.values());
    if (repo) {
      return all.filter((d) => d.repo === repo);
    }
    return all;
  },
};
