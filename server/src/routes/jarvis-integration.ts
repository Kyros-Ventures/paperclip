/**
 * JARVIS Integration Routes
 *
 * POST /api/jarvis/webhook — Receive classified Telegram messages from JARVIS
 *
 * Uses webhook-security for HMAC/IP/replay verification before dispatching.
 * Follows the same pattern as github-integration.ts.
 */

import { Router, type Request, type Response } from "express";
import {
  createJarvisWebhookService,
  validatePayload,
  getJarvisSecret,
  type JarvisWebhookPayload,
} from "../services/jarvis-webhook.js";
import { webhookSecurity } from "../services/webhook-security.js";
import { logger } from "../middleware/logger.js";

// ============================================================================
// Route Factory
// ============================================================================

export function jarvisIntegrationRoutes() {
  const router = Router();
  const service = createJarvisWebhookService();

  // Default company ID for JARVIS — TEC (TechnoTrixx)
  const DEFAULT_COMPANY_ID = "29a857f9-3e94-460c-8a91-9e2ed41e7967";

  /**
   * POST /api/jarvis/webhook
   *
   * Receives classified Telegram messages from JARVIS.
   * Three security layers applied before dispatch:
   * 1. HMAC-SHA256 signature verification
   * 2. IP allowlist check
   * 3. Replay prevention
   *
   * Headers:
   *   X-Hub-Signature-256: sha256=<hex> (or X-Webhook-Signature)
   *   X-Webhook-Timestamp: <unix ms>
   *   X-Webhook-Nonce: <unique string>
   *
   * Body: JarvisWebhookPayload (JSON)
   */
  router.post("/webhook", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // --- Security Layer ---
      // Extract raw body and client IP for security verification
      const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody?.toString() ?? JSON.stringify(req.body);
      const rawHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") rawHeaders[key] = value;
        else if (Array.isArray(value)) rawHeaders[key] = value[0] ?? "";
      }
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";

      const securityResult = webhookSecurity.verify(rawBody, rawHeaders, clientIp);
      if (!securityResult.allowed) {
        logger.warn({ error: securityResult.error, clientIp }, "JARVIS webhook rejected by security");
        res.status(securityResult.statusCode || 403).json({
          success: false,
          error: securityResult.error || "Access denied",
        });
        return;
      }

      // --- Payload Validation ---
      const validation = validatePayload(req.body);
      if (!validation.valid) {
        const errMsg = (validation as { error: string }).error;
        logger.warn({ error: errMsg }, "JARVIS webhook payload invalid");
        res.status(400).json({ success: false, error: errMsg });
        return;
      }

      const payload: JarvisWebhookPayload = validation.data;

      // --- Company ID ---
      const companyId = (req.body.companyId as string) || DEFAULT_COMPANY_ID;

      // --- Dispatch ---
      logger.info(
        { eventId: payload.eventId, intent: payload.intent },
        "JARVIS webhook processing",
      );

      const result = await service.process(payload, companyId);

      logger.info(
        {
          eventId: payload.eventId,
          intent: payload.intent,
          success: result.success,
          duration: result.processingMs,
        },
        "JARVIS webhook processed",
      );

      res.status(result.success ? 200 : 422).json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "JARVIS webhook error");

      res.status(200).json({
        success: false,
        error: "Internal processing error",
        processingMs: Date.now() - startTime,
      });
    }
  });

  /**
   * GET /api/jarvis/health
   *
   * Health check endpoint for JARVIS integration.
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      secretConfigured: !!getJarvisSecret(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
