/**
 * Notification Center Routes
 *
 * GET  /api/companies/:companyId/notifications          — Recent notification-worthy activity
 * GET  /api/companies/:companyId/notifications/status   — Notification delivery health
 * GET  /api/companies/:companyId/notifications/preferences — User notification preferences
 */

import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess, assertAuthenticated } from "./authz.js";
import { activityService } from "../services/activity.js";
import { heartbeatService } from "../services/index.js";

// Notification-worthy action types
const NOTIFY_ACTIONS = new Set([
  "issue.completed",
  "issue.created",
  "issue.assigned",
  "issue.blocked",
  "issue.unblocked",
  "agent.activated",
  "agent.error",
  "agent.terminated",
  "review.requested",
  "review.approved",
  "review.rejected",
  "deployment.started",
  "deployment.completed",
  "deployment.failed",
  "goal.completed",
  "approval.requested",
  "approval.granted",
  "approval.denied",
]);

export function notificationRoutes(db: Db) {
  const router = Router();
  const activity = activityService(db);
  const heartbeat = heartbeatService(db);

  /**
   * GET /companies/:companyId/notifications
   * Lists recent notification-worthy activity for the company.
   */
  router.get(
    "/companies/:companyId/notifications",
    async (req: Request, res: Response) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const raw = await activity.list({ companyId, limit: limit * 3 });

        // Filter to notification-worthy actions only
        const notifications = raw
          .filter((e) => NOTIFY_ACTIONS.has(e.action))
          .slice(0, limit);

        // Enrich with agent names
        const agents = new Map<string, string>();
        for (const n of notifications) {
          if (n.agentId && !agents.has(n.agentId)) {
            try {
              const agent = await heartbeat.getAgent?.(n.agentId);
              if (agent) agents.set(n.agentId, agent.name);
            } catch { /* agent may not exist */ }
          }
        }

        const enriched = notifications.map((n) => ({
          ...n,
          agentName: n.agentId ? agents.get(n.agentId) ?? null : null,
        }));

        res.json(enriched);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  /**
   * GET /companies/:companyId/notifications/status
   * Returns notification delivery health status.
   */
  router.get(
    "/companies/:companyId/notifications/status",
    async (req: Request, res: Response) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        // Simple status: check if we can query the DB
        const recent = await activity.list({ companyId, limit: 1 });

        res.json({
          healthy: true,
          lastActivityAt: recent[0]?.createdAt ?? null,
          channels: {
            inApp: { status: "active" as const },
            telegram: { status: "configured" as const },
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  /**
   * GET /companies/:companyId/notifications/preferences
   * Returns current notification preferences (stub — persisted in a future iteration).
   */
  router.get(
    "/companies/:companyId/notifications/preferences",
    async (req: Request, res: Response) => {
      try {
        const companyId = req.params.companyId as string;
        assertCompanyAccess(req, companyId);

        res.json({
          companyId,
          channels: {
            inApp: { enabled: true },
            telegram: { enabled: true, chatId: null },
          },
          filters: {
            issueCompleted: true,
            issueBlocked: true,
            agentError: true,
            deploymentFailed: true,
            approvalRequested: true,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
