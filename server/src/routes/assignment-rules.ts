/**
 * Assignment Rules Routes
 *
 * GET    /api/companies/:companyId/assignment-rules       — List all rules for a company
 * POST   /api/companies/:companyId/assignment-rules       — Create a new rule
 * PATCH  /api/assignment-rules/:ruleId                    — Update a rule
 * DELETE /api/assignment-rules/:ruleId                    — Delete a rule
 */

import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assignmentRules } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export function assignmentRuleRoutes(db: Db) {
  const router = Router();

  router.get(
    "/companies/:companyId/assignment-rules",
    async (req: Request, res: Response) => {
      try {
        const { companyId } = req.params as { companyId: string };
        assertCompanyAccess(req, companyId);

        const rules = await db.query.assignmentRules.findMany({
          where: eq(assignmentRules.companyId, companyId),
          orderBy: (rules, { asc }) => [asc(rules.priority)],
        });

        res.json({ data: rules });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  router.post(
    "/companies/:companyId/assignment-rules",
    async (req: Request, res: Response) => {
      try {
        const { companyId } = req.params as { companyId: string };
        assertCompanyAccess(req, companyId);

        const { name, description, conditions, action, priority, enabled } = req.body as Record<string, unknown>;
        if (!name || typeof name !== "string") {
          return res.status(400).json({ error: "name is required" });
        }

        const [rule] = await db
          .insert(assignmentRules)
          .values({
            companyId,
            name,
            description: (description as string | null) ?? null,
            conditions: (conditions as Record<string, unknown>) ?? {},
            action: (action as Record<string, unknown>) ?? {},
            priority: (priority as number) ?? 0,
            enabled: (enabled as boolean) ?? true,
          })
          .returning();

        res.status(201).json(rule);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  router.patch(
    "/assignment-rules/:ruleId",
    async (req: Request, res: Response) => {
      try {
        const { ruleId } = req.params as { ruleId: string };

        const existing = await db.query.assignmentRules.findFirst({
          where: eq(assignmentRules.id, ruleId),
        });
        if (!existing) {
          return res.status(404).json({ error: "Rule not found" });
        }
        assertCompanyAccess(req, existing.companyId);

        const { name, description, conditions, action, priority, enabled } = req.body as Record<string, unknown>;
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (conditions !== undefined) updates.conditions = conditions;
        if (action !== undefined) updates.action = action;
        if (priority !== undefined) updates.priority = priority;
        if (enabled !== undefined) updates.enabled = enabled;

        const [updated] = await db
          .update(assignmentRules)
          .set(updates)
          .where(eq(assignmentRules.id, ruleId))
          .returning();

        res.json(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  router.delete(
    "/assignment-rules/:ruleId",
    async (req: Request, res: Response) => {
      try {
        const { ruleId } = req.params as { ruleId: string };

        const existing = await db.query.assignmentRules.findFirst({
          where: eq(assignmentRules.id, ruleId),
        });
        if (!existing) {
          return res.status(404).json({ error: "Rule not found" });
        }
        assertCompanyAccess(req, existing.companyId);

        await db.delete(assignmentRules).where(eq(assignmentRules.id, ruleId));
        res.json({ success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
