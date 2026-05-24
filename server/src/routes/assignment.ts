/**
 * Assignment Engine Routes
 *
 * POST /api/companies/:companyId/auto-assign                      — Auto-assign an issue to the best agent
 * GET  /api/companies/:companyId/assignment-recommendations       — Score all agents for a given issue
 * GET  /api/companies/:companyId/workload                         — Workload analytics across all agents
 */

import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import {
  autoAssign,
  calculateAgentScore,
  getAssignmentAnalytics,
} from "../services/issues/issue-assignment.js";

export function assignmentRoutes(db: Db) {
  const router = Router();

  /**
   * POST /companies/:companyId/auto-assign
   * Auto-assign an unassigned issue to the best available agent.
   */
  router.post(
    "/companies/:companyId/auto-assign",
    async (req: Request, res: Response) => {
      try {
        const { companyId } = req.params as { companyId: string };
        assertCompanyAccess(req, companyId);

        const { issueId } = req.body as { issueId?: string };
        if (!issueId) {
          return res.status(400).json({ error: "issueId is required" });
        }

        const result = await autoAssign(db, issueId, companyId);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  /**
   * GET /companies/:companyId/assignment-recommendations?issueId=...
   * Score all active agents for a given issue and return sorted recommendations.
   */
  router.get(
    "/companies/:companyId/assignment-recommendations",
    async (req: Request, res: Response) => {
      try {
        const { companyId } = req.params as { companyId: string };
        assertCompanyAccess(req, companyId);

        const { issueId } = req.query as { issueId?: string };
        if (!issueId) {
          return res.status(400).json({ error: "issueId query parameter is required" });
        }

        const issue = await db.query.issues.findFirst({
          where: and(eq(issues.id, issueId), eq(issues.companyId, companyId)),
        });
        if (!issue) {
          return res.status(404).json({ error: "Issue not found" });
        }

        const companyAgents = await db.query.agents.findMany({
          where: and(eq(agents.companyId, companyId), eq(agents.status, "active")),
        });

        if (companyAgents.length === 0) {
          return res.json({ recommendations: [], message: "No active agents available" });
        }

        const issueReq = {
          title: issue.title,
          description: issue.description ?? "",
          priority: issue.priority ?? "medium",
        };

        const scored = await Promise.all(
          companyAgents.map((agent) => calculateAgentScore(db, agent, issueReq)),
        );
        scored.sort((a, b) => b.totalScore - a.totalScore);

        res.json({ recommendations: scored, topRecommendation: scored[0] });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  /**
   * GET /companies/:companyId/workload
   * Returns workload utilization across all agents in the company.
   */
  router.get(
    "/companies/:companyId/workload",
    async (req: Request, res: Response) => {
      try {
        const { companyId } = req.params as { companyId: string };
        assertCompanyAccess(req, companyId);

        const analytics = await getAssignmentAnalytics(db, companyId);
        res.json(analytics);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
