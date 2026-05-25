/**
 * GitHub Integration Routes
 *
 * POST /api/github/webhook         — GitHub webhook receiver (PR events)
 * POST /api/github/link-pr         — Manually link a PR to an issue
 * GET  /api/github/config/:projectId — Get AI review config for a project
 * PUT  /api/github/config/:projectId — Create/update AI review config
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { aiReviewQueue, aiReviewConfig, projects } from "@paperclipai/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound, conflict } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { createGitHubWebhookServiceFromEnv } from "../services/github-webhook.js";
import type { Db } from "@paperclipai/db";

// ============================================================================
// Validation Schemas
// ============================================================================

const linkPRSchema = z.object({
  issueId: z.string().uuid(),
  prUrl: z.string().url(),
  prNumber: z.number().int().positive(),
  repository: z.string().min(1),
  branch: z.string().min(1),
});

const aiReviewConfigSchema = z.object({
  repository: z.string().min(1),
  isEnabled: z.boolean().default(true),
  autoReviewPatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  minSeverityThreshold: z
    .enum(["critical", "warning", "suggestion", "info"])
    .optional(),
  requireHumanFor: z.record(z.unknown()).optional(),
  maxFileSizeKb: z.number().int().positive().optional(),
  maxTotalSizeKb: z.number().int().positive().optional(),
  customRules: z.record(z.unknown()).optional(),
  customPromptOverrides: z.record(z.unknown()).optional(),
});

// ============================================================================
// Webhook Signature Verification
// ============================================================================

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

function getWebhookSecret(): string | undefined {
  return process.env.GITHUB_WEBHOOK_SECRET;
}

// ============================================================================
// Route Factory
// ============================================================================

export function githubIntegrationRoutes(db: Db) {
  const router = Router();

  // ============================================================================
  // POST /api/github/webhook
  // ============================================================================
  router.post("/webhook", async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      if (!signature) {
        logger.warn("GitHub webhook received without signature");
        res.status(401).json({ error: "Missing signature header" });
        return;
      }

      const eventType = req.headers["x-github-event"] as string | undefined;
      if (!eventType) {
        logger.warn("GitHub webhook received without event type");
        res.status(400).json({ error: "Missing event type header" });
        return;
      }

      const secret = getWebhookSecret();
      if (!secret) {
        logger.error("GITHUB_WEBHOOK_SECRET not configured");
        res.status(500).json({ error: "Webhook secret not configured" });
        return;
      }

      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        logger.error("Raw body not available for signature verification");
        res.status(500).json({ error: "Unable to verify signature" });
        return;
      }

      const isValid = verifyWebhookSignature(
        rawBody.toString(),
        signature,
        secret,
      );
      if (!isValid) {
        logger.warn("GitHub webhook signature verification failed");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      logger.info(
        {
          eventType,
          deliveryId: req.headers["x-github-delivery"],
        },
        "GitHub webhook received",
      );

      if (eventType === "pull_request") {
        const payload = req.body as { action: string; number: number; pull_request: unknown; repository: unknown };
        const action = payload.action;

        if (action === "opened" || action === "reopened") {
          logger.info(
            { prNumber: payload.number },
            "PR opened/reopened event received",
          );
          try {
            const webhookService = createGitHubWebhookServiceFromEnv();
            const result = await webhookService.handlePullRequestOpened(payload as Parameters<typeof webhookService.handlePullRequestOpened>[0]);
            if (!result.success) {
              logger.warn({ error: result.error, prNumber: payload.number }, "Failed to process PR opened event");
            }
          } catch (error) {
            logger.error(
              { error: String(error), prNumber: payload.number },
              "Error processing PR opened event",
            );
          }
        }

        if (action === "synchronize") {
          logger.info(
            { prNumber: payload.number },
            "PR synchronize event received",
          );
          try {
            const webhookService = createGitHubWebhookServiceFromEnv();
            const result = await webhookService.handlePullRequestSynchronized(payload as Parameters<typeof webhookService.handlePullRequestSynchronized>[0]);
            if (!result.success) {
              logger.warn({ error: result.error, prNumber: payload.number }, "Failed to process PR synchronize event");
            }
          } catch (error) {
            logger.error(
              { error: String(error), prNumber: payload.number },
              "Error processing PR synchronize event",
            );
          }
        }
      }

      res.status(200).json({
        success: true,
        processed: true,
        eventType,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage },
        "Unexpected error in GitHub webhook handler",
      );
      res.status(200).json({
        success: false,
        processed: false,
        error: "Internal processing error",
      });
    }
  });

  // ============================================================================
  // POST /api/github/link-pr
  // ============================================================================
  router.post("/link-pr", validate(linkPRSchema), async (req: Request, res: Response) => {
    try {
      const { issueId, prUrl, prNumber, repository, branch } = req.body as {
        issueId: string;
        prUrl: string;
        prNumber: number;
        repository: string;
        branch: string;
      };

      const issue = await db.query.issues.findFirst({
        where: (issues, { eq }) => eq(issues.id, issueId),
      });

      if (!issue) {
        throw notFound("Issue not found");
      }

      const existingQueueItem = await db.query.aiReviewQueue.findFirst({
        where: (queue, { eq, and }) =>
          and(eq(queue.issueId, issueId), eq(queue.prNumber, prNumber)),
      });

      if (existingQueueItem) {
        throw conflict("PR is already linked to this issue");
      }

      const [queueItem] = await db
        .insert(aiReviewQueue)
        .values({
          issueId,
          prUrl,
          prNumber,
          repository,
          branch,
          baseBranch: "main",
          status: "pending",
          triggerType: "manual",
          priority: 5,
        })
        .returning();

      logger.info(
        { queueId: queueItem.id, issueId, prNumber, repository },
        "PR linked to issue and added to AI review queue",
      );

      triggerAIReviewQueueProcessing(db, queueItem.id).catch((error) => {
        logger.error(
          { error: String(error), queueId: queueItem.id },
          "Error triggering AI review queue processing",
        );
      });

      res.status(201).json({ success: true, data: queueItem });
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "Error linking PR to issue");
      throw badRequest("Failed to link PR to issue", { error: errorMessage });
    }
  });

  // ============================================================================
  // GET /api/github/config/:projectId
  // ============================================================================
  router.get("/config/:projectId", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const pid = projectId as string;

      const project = await db.query.projects.findFirst({
        where: eq(projects.id, pid),
      });

      if (!project) {
        throw notFound("Project not found");
      }

      const configs = await db
        .select()
        .from(aiReviewConfig)
        .where(eq(aiReviewConfig.projectId, pid));

      res.json({ success: true, data: configs });
    } catch (error) {
      if (error instanceof Error && "status" in error) throw error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, projectId: req.params.projectId },
        "Error fetching AI review config",
      );
      throw badRequest("Failed to fetch AI review config", {
        error: errorMessage,
      });
    }
  });

  // ============================================================================
  // PUT /api/github/config/:projectId
  // ============================================================================
  router.put(
    "/config/:projectId",
    validate(aiReviewConfigSchema),
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const pid = projectId as string;
        const configData = req.body as {
          repository: string;
          isEnabled?: boolean;
          autoReviewPatterns?: string[];
          excludePatterns?: string[];
          minSeverityThreshold?: string;
          requireHumanFor?: Record<string, unknown>;
          maxFileSizeKb?: number;
          maxTotalSizeKb?: number;
          customRules?: Record<string, unknown>;
          customPromptOverrides?: Record<string, unknown>;
        };

        const project = await db.query.projects.findFirst({
          where: eq(projects.id, pid),
        });

        if (!project) {
          throw notFound("Project not found");
        }

        const existingConfig = await db.query.aiReviewConfig.findFirst({
          where: and(
            eq(aiReviewConfig.projectId, pid),
            eq(aiReviewConfig.repository, configData.repository),
          ),
        });

        let config;
        if (existingConfig) {
          const [updatedConfig] = await db
            .update(aiReviewConfig)
            .set({ ...configData, updatedAt: new Date() })
            .where(eq(aiReviewConfig.id, existingConfig.id))
            .returning();
          config = updatedConfig;
          logger.info(
            { configId: config.id, projectId, repository: configData.repository },
            "AI review config updated",
          );
        } else {
          const [newConfig] = await db
            .insert(aiReviewConfig)
            .values({ projectId: pid, ...configData })
            .returning();
          config = newConfig;
          logger.info(
            { configId: config.id, projectId, repository: configData.repository },
            "AI review config created",
          );
        }

        res.status(existingConfig ? 200 : 201).json({
          success: true,
          data: config,
        });
      } catch (error) {
        if (error instanceof Error && "status" in error) throw error;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          { error: errorMessage, projectId: req.params.projectId },
          "Error updating AI review config",
        );
        throw badRequest("Failed to update AI review config", {
          error: errorMessage,
        });
      }
    },
  );

  return router;
}

// ============================================================================
// Helpers
// ============================================================================

async function triggerAIReviewQueueProcessing(
  _db: Db,
  queueItemId: string,
): Promise<void> {
  logger.info(
    { queueItemId },
    "AI review queue processing triggered (placeholder)",
  );
}
