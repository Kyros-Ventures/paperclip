/**
 * Estimation Engine Routes
 *
 * GET  /api/companies/:companyId/estimation/config  — Estimation configuration
 * GET  /api/companies/:companyId/estimation/history — Historical task cycle times and estimates
 */

import { Router, type Request, type Response } from "express";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues, agents } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export interface EstimationConfig {
  method: "cycle_time" | "story_points" | "hybrid";
  enabled: boolean;
  lookbackDays: number;
  priorityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  updatedAt: string | null;
}

export interface EstimationRecord {
  issueId: string;
  issueIdentifier: string;
  issueTitle: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeAgentName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cycleTimeHours: number | null;
  estimatedHours: number | null;
  accuracyPercent: number | null;
}

export interface EstimationHistory {
  records: EstimationRecord[];
  summary: {
    totalCompleted: number;
    avgCycleTimeHours: number | null;
    byPriority: Record<string, { count: number; avgCycleTimeHours: number | null }>;
  };
}

const DEFAULT_CONFIG: EstimationConfig = {
  method: "cycle_time",
  enabled: true,
  lookbackDays: 30,
  priorityWeights: {
    critical: 4.0,
    high: 2.0,
    medium: 1.0,
    low: 0.5,
  },
  updatedAt: null,
};

export function estimationRoutes(db: Db) {
  const router = Router();

  /**
   * GET /companies/:companyId/estimation/config
   * Returns estimation engine configuration.
   */
  router.get(
    "/companies/:companyId/estimation/config",
    async (req: Request, res: Response) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);
        res.json(DEFAULT_CONFIG);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  /**
   * GET /companies/:companyId/estimation/history
   * Returns recent completed issues with cycle time data for estimation analysis.
   * Query params:
   *   limit  — max records to return (default 50, max 200)
   *   days   — lookback window in days (default 30, max 365)
   */
  router.get(
    "/companies/:companyId/estimation/history",
    async (req: Request, res: Response) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const days = Math.min(Number(req.query.days) || 30, 365);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const rows = await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
            priority: issues.priority,
            assigneeAgentId: issues.assigneeAgentId,
            agentName: agents.name,
            startedAt: issues.startedAt,
            completedAt: issues.completedAt,
          })
          .from(issues)
          .leftJoin(agents, eq(agents.id, issues.assigneeAgentId))
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.status, "done"),
              isNotNull(issues.startedAt),
              isNotNull(issues.completedAt),
              sql`${issues.completedAt} >= ${since.toISOString()}`,
            ),
          )
          .orderBy(desc(issues.completedAt))
          .limit(limit);

        const records: EstimationRecord[] = rows.map((row) => {
          const cycleTimeHours =
            row.startedAt && row.completedAt
              ? (new Date(row.completedAt).getTime() - new Date(row.startedAt).getTime()) /
                3_600_000
              : null;

          const weight = DEFAULT_CONFIG.priorityWeights[row.priority as keyof typeof DEFAULT_CONFIG.priorityWeights];
          const estimatedHours = weight != null ? weight * 4 : null;

          const accuracyPercent =
            cycleTimeHours != null && estimatedHours != null && estimatedHours > 0
              ? Math.round((1 - Math.abs(cycleTimeHours - estimatedHours) / estimatedHours) * 100)
              : null;

          return {
            issueId: row.id,
            issueIdentifier: row.identifier ?? row.id,
            issueTitle: row.title,
            priority: row.priority,
            assigneeAgentId: row.assigneeAgentId,
            assigneeAgentName: row.agentName ?? null,
            startedAt: row.startedAt?.toISOString() ?? null,
            completedAt: row.completedAt?.toISOString() ?? null,
            cycleTimeHours,
            estimatedHours,
            accuracyPercent,
          };
        });

        const validCycles = records.filter((r) => r.cycleTimeHours != null);
        const avgCycleTimeHours =
          validCycles.length > 0
            ? validCycles.reduce((sum, r) => sum + r.cycleTimeHours!, 0) / validCycles.length
            : null;

        const byPriority: Record<string, { count: number; avgCycleTimeHours: number | null }> = {};
        for (const record of records) {
          const p = record.priority;
          if (!byPriority[p]) byPriority[p] = { count: 0, avgCycleTimeHours: null };
          byPriority[p].count++;
        }
        for (const p of Object.keys(byPriority)) {
          const group = records.filter((r) => r.priority === p && r.cycleTimeHours != null);
          byPriority[p].avgCycleTimeHours =
            group.length > 0
              ? group.reduce((sum, r) => sum + r.cycleTimeHours!, 0) / group.length
              : null;
        }

        const history: EstimationHistory = {
          records,
          summary: {
            totalCompleted: records.length,
            avgCycleTimeHours:
              avgCycleTimeHours != null ? Math.round(avgCycleTimeHours * 10) / 10 : null,
            byPriority,
          },
        };

        res.json(history);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
