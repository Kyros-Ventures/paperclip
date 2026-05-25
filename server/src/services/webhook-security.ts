/**
 * Webhook Security Service
 *
 * Shared HMAC/IP/Replay verification for webhook endpoints.
 * Used by JARVIS integration and reusable for other webhook receivers.
 */

import crypto from "crypto";
import { logger } from "../middleware/logger.js";

// ============================================================================
// Types
// ============================================================================

export interface SecurityResult {
  allowed: boolean;
  error?: string;
  statusCode?: number;
}

// ============================================================================
// Webhook Security
// ============================================================================

class WebhookSecurity {
  private readonly secret: string;
  private readonly ipAllowlist: string[];
  /** Max age of webhook in milliseconds (5 minutes) */
  private readonly maxAgeMs: number = 5 * 60 * 1000;
  /** In-memory nonce cache to prevent replays */
  private readonly nonceCache = new Set<string>();

  constructor() {
    this.secret = process.env.JARVIS_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "";
    this.ipAllowlist = (process.env.WEBHOOK_IP_ALLOWLIST || "127.0.0.1,::1,::ffff:127.0.0.1")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
  }

  verify(
    rawBody: string,
    rawHeaders: Record<string, string>,
    clientIp: string,
  ): SecurityResult {
    // 1. IP allowlist check (skip if allowlist is empty)
    if (this.ipAllowlist.length > 0) {
      const normalizedIp = clientIp.replace(/^::ffff:/, "");
      if (!this.ipAllowlist.some((allowed) => {
        if (allowed === normalizedIp) return true;
        if (allowed === clientIp) return true;
        return false;
      })) {
        return {
          allowed: false,
          error: `IP ${clientIp} not in allowlist`,
          statusCode: 403,
        };
      }
    }

    // 2. Replay prevention via nonce
    const nonce = rawHeaders["x-webhook-nonce"] || rawHeaders["X-Webhook-Nonce"];
    if (nonce) {
      if (this.nonceCache.has(nonce)) {
        return {
          allowed: false,
          error: "Replay detected: nonce already used",
          statusCode: 403,
        };
      }
      this.nonceCache.add(nonce);
      // Limit cache size
      if (this.nonceCache.size > 10000) {
        const iter = this.nonceCache.values();
        for (let i = 0; i < 5000; i++) {
          const { value } = iter.next();
          if (value) this.nonceCache.delete(value);
        }
      }
    }

    // 3. Timestamp freshness check
    const timestamp = rawHeaders["x-webhook-timestamp"] || rawHeaders["X-Webhook-Timestamp"];
    if (timestamp) {
      const ts = parseInt(timestamp, 10);
      if (!isNaN(ts)) {
        const age = Date.now() - ts;
        if (age > this.maxAgeMs || age < -60000) {
          return {
            allowed: false,
            error: `Timestamp too old or in future (age: ${age}ms)`,
            statusCode: 403,
          };
        }
      }
    }

    // 4. HMAC signature verification (only if secret is configured)
    if (this.secret) {
      const signatureHeader =
        rawHeaders["x-hub-signature-256"] ||
        rawHeaders["X-Hub-Signature-256"] ||
        rawHeaders["x-webhook-signature"] ||
        rawHeaders["X-Webhook-Signature"];

      if (signatureHeader) {
        const sigParts = signatureHeader.split("=");
        const expectedSig = sigParts.length === 2 ? sigParts[1] : signatureHeader;
        const computedSig = crypto
          .createHmac("sha256", this.secret)
          .update(rawBody, "utf-8")
          .digest("hex");

        if (
          !crypto.timingSafeEqual(
            Buffer.from(computedSig, "hex"),
            Buffer.from(expectedSig, "hex"),
          )
        ) {
          return {
            allowed: false,
            error: "HMAC signature mismatch",
            statusCode: 403,
          };
        }
      } else if (timestamp || nonce) {
        // Headers indicate security intent but no signature — reject
        return {
          allowed: false,
          error: "Missing signature header",
          statusCode: 401,
        };
      }
    }

    return { allowed: true };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const webhookSecurity = new WebhookSecurity();
