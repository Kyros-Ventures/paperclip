/**
 * Deployment Routes
 *
 * POST   /companies/:companyId/deployments/staging              — Deploy to staging
 * POST   /companies/:companyId/deployments/:deployId/approve    — Request production approval
 * POST   /companies/:companyId/deployments/production           — Deploy to production
 * POST   /companies/:companyId/deployments/:deployId/rollback   — Rollback a deployment
 * GET    /companies/:companyId/deployments/:deployId            — Get deployment by ID
 * GET    /companies/:companyId/deployments                      — List deployments
 */

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { deploymentService } from "../services/deploymentService.js";

export function deploymentRoutes(_db: Db) {
  const router = Router();

  // POST /companies/:companyId/deployments/staging
  router.post(
    "/companies/:companyId/deployments/staging",
    async (req: Request, res: Response) => {
      try {
        const { repo, branch } = req.body;
        const result = await deploymentService.deployToStaging(repo, branch);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // POST /companies/:companyId/deployments/:deployId/approve
  router.post(
    "/companies/:companyId/deployments/:deployId/approve",
    async (req: Request, res: Response) => {
      try {
        const { requestedBy } = req.body;
        const result = await deploymentService.requestProductionApproval(
          requestedBy,
        );
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // POST /companies/:companyId/deployments/production
  router.post(
    "/companies/:companyId/deployments/production",
    async (req: Request, res: Response) => {
      try {
        const { repo, stagingDeployId, approver } = req.body;
        const result = await deploymentService.deployToProduction(
          repo,
          stagingDeployId,
          approver,
        );
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // POST /companies/:companyId/deployments/:deployId/rollback
  router.post(
    "/companies/:companyId/deployments/:deployId/rollback",
    async (_req: Request, res: Response) => {
      try {
        await deploymentService.rollback();
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  // GET /companies/:companyId/deployments/:deployId
  router.get(
    "/companies/:companyId/deployments/:deployId",
    (req: Request, res: Response) => {
      const deployment = deploymentService.getDeployment(
        req.params.deployId,
      );
      if (!deployment) {
        return res.status(404).json({ error: "Deployment not found" });
      }
      res.json(deployment);
    },
  );

  // GET /companies/:companyId/deployments
  router.get(
    "/companies/:companyId/deployments",
    (req: Request, res: Response) => {
      const repo = req.query.repo as string | undefined;
      const result = deploymentService.listDeployments(repo);
      res.json(result);
    },
  );

  return router;
}
