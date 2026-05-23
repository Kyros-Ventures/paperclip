/**
 * Outbound Webhook Service
 *
 * Signs and delivers webhook payloads from Paperclip to agent listener endpoints.
 * Implements TEC-167: Paperclip → Agent Bridge.
 *
 * When an issue is created or assigned to an agent with a webhookUrl configured,
 * this service signs the payload with HMAC-SHA256 and POSTs it to the agent's endpoint.
 *
 * Uses the same WEBHOOK_SECRET for signing that inbound webhooks use for verification.
 */

import { createHmac, randomUUID } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export interface OutboundWebhookPayload {
  event: "issue.created" | "issue.assigned" | "issue.updated";
  eventId: string;
  timestamp: string;
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    priority: string;
    description: string | null;
    assigneeAgentId: string | null;
    parentId: string | null;
    companyId: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

function getSecret(): string | null {
  return (
    process.env["WEBHOOK_SECRET"] ||
    process.env["PAPERCLIP_WEBHOOK_SECRET"] ||
    null
  );
}

function getDeliveryTimeoutMs(): number {
  const raw = process.env["WEBHOOK_DELIVERY_TIMEOUT_MS"];
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 10_000; // 10 seconds default
}

// ============================================================================
// Payload Signing
// ============================================================================

/**
 * Create a signed webhook payload with HMAC-SHA256.
 * Adds X-Webhook-Signature, X-Webhook-Timestamp, and X-Webhook-Nonce headers.
 */
export function createSignedPayload(
  payload: OutboundWebhookPayload,
): { body: string; headers: Record<string, string> } {
  const secret = getSecret();
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const nonce = randomUUID();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Nonce": nonce,
  };

  if (secret) {
    const signature = createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    headers["X-Hub-Signature-256"] = `sha256=${signature}`;
  }

  return { body, headers };
}

// ============================================================================
// Payload Construction
// ============================================================================

export function buildIssuePayload(
  event: OutboundWebhookPayload["event"],
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    priority: string;
    description: string | null;
    assigneeAgentId: string | null;
    parentId: string | null;
    companyId: string;
    createdAt: Date | string;
    updatedAt: Date | string;
  },
): OutboundWebhookPayload {
  return {
    event,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      description: issue.description,
      assigneeAgentId: issue.assigneeAgentId,
      parentId: issue.parentId,
      companyId: issue.companyId,
      createdAt:
        typeof issue.createdAt === "string"
          ? issue.createdAt
          : issue.createdAt.toISOString(),
      updatedAt:
        typeof issue.updatedAt === "string"
          ? issue.updatedAt
          : issue.updatedAt.toISOString(),
    },
  };
}

// ============================================================================
// Delivery
// ============================================================================

/**
 * Deliver a webhook payload to an agent's webhook URL.
 * Handles timeout, non-2xx responses, and network errors gracefully.
 * Delivery failures are logged but do not throw — they are non-blocking.
 */
export async function deliverWebhook(
  webhookUrl: string,
  payload: OutboundWebhookPayload,
): Promise<DeliveryResult> {
  const startTime = Date.now();

  try {
    const { body, headers } = createSignedPayload(payload);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getDeliveryTimeoutMs());

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    return {
      success: response.ok,
      statusCode: response.status,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Convenience: build + deliver in one call
// ============================================================================

export async function notifyAgent(
  webhookUrl: string,
  event: OutboundWebhookPayload["event"],
  issue: Parameters<typeof buildIssuePayload>[1],
): Promise<DeliveryResult> {
  const payload = buildIssuePayload(event, issue);
  return deliverWebhook(webhookUrl, payload);
}
