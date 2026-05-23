/**
 * JARVIS Webhook Dispatcher Service
 *
 * Receives classified Telegram messages from JARVIS and creates Paperclip issues.
 * Implements the first link: JARVIS (Telegram classifier) → Paperclip (issue creation).
 *
 * Uses Paperclip's internal REST API for issue creation to stay decoupled from DB schema.
 *
 * Environment variables:
 *   JARVIS_WEBHOOK_SECRET — shared secret for HMAC (falls back to WEBHOOK_SECRET)
 *   PAPERCLIP_API_URL     — Paperclip API base URL (default: http://127.0.0.1:3101/api)
 */

// ============================================================================
// Types
// ============================================================================

/** Inbound payload from JARVIS after Telegram message classification */
export interface JarvisWebhookPayload {
  /** JARVIS-generated unique event ID for deduplication */
  eventId: string;
  /** Classification intent */
  intent: JarvisIntent;
  /** Source Telegram message metadata */
  source: {
    chatId: string;
    messageId: number;
    fromUser: string;
    timestamp: string;
  };
  /** Structured issue data (for create_task intent) */
  task?: {
    title: string;
    description?: string;
    priority?: "critical" | "high" | "medium" | "low";
    assigneeAgentId?: string;
    parentId?: string;
    labels?: string[];
  };
  /** Status update data (for status_update intent) */
  statusUpdate?: {
    issueIdentifier: string;
    newStatus?: string;
    comment?: string;
  };
  /** Free-form query data */
  query?: {
    text: string;
    context?: string;
  };
}

export type JarvisIntent = "create_task" | "status_update" | "query" | "ping";

/** Response sent back to JARVIS */
export interface JarvisWebhookResponse {
  success: boolean;
  eventId: string;
  intent: JarvisIntent;
  action?: string;
  issueId?: string;
  issueIdentifier?: string;
  error?: string;
  processingMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

function getJarvisSecret(): string | null {
  return (
    process.env["JARVIS_WEBHOOK_SECRET"] ||
    process.env["WEBHOOK_SECRET"] ||
    process.env["PAPERCLIP_WEBHOOK_SECRET"] ||
    null
  );
}

function getPaperclipApiUrl(): string {
  return process.env["PAPERCLIP_API_URL"] || "http://127.0.0.1:3101/api";
}

// ============================================================================
// Payload Validation
// ============================================================================

const VALID_INTENTS: JarvisIntent[] = ["create_task", "status_update", "query", "ping"];

export function validatePayload(
  payload: unknown
): { valid: true; data: JarvisWebhookPayload } | { valid: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload must be a JSON object" };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.eventId !== "string" || !p.eventId) {
    return { valid: false, error: "Missing or invalid eventId" };
  }

  if (typeof p.intent !== "string" || !VALID_INTENTS.includes(p.intent as JarvisIntent)) {
    return { valid: false, error: `Invalid intent. Must be: ${VALID_INTENTS.join(", ")}` };
  }

  if (!p.source || typeof p.source !== "object") {
    return { valid: false, error: "Missing source metadata" };
  }

  const source = p.source as Record<string, unknown>;
  if (typeof source.chatId !== "string" || !source.chatId) {
    return { valid: false, error: "Missing source.chatId" };
  }

  if (p.intent === "create_task") {
    if (!p.task || typeof p.task !== "object") {
      return { valid: false, error: "create_task intent requires task data" };
    }
    const task = p.task as Record<string, unknown>;
    if (typeof task.title !== "string" || !task.title) {
      return { valid: false, error: "task.title is required for create_task" };
    }
  }

  if (p.intent === "status_update") {
    if (!p.statusUpdate || typeof p.statusUpdate !== "object") {
      return { valid: false, error: "status_update intent requires statusUpdate data" };
    }
    const su = p.statusUpdate as Record<string, unknown>;
    if (typeof su.issueIdentifier !== "string" || !su.issueIdentifier) {
      return { valid: false, error: "statusUpdate.issueIdentifier is required" };
    }
  }

  return { valid: true, data: p as unknown as JarvisWebhookPayload };
}

// ============================================================================
// Dispatcher
// ============================================================================

export interface JarvisWebhookService {
  process(payload: JarvisWebhookPayload, companyId: string): Promise<JarvisWebhookResponse>;
}

/**
 * Create a JARVIS webhook service that uses Paperclip's internal REST API.
 */
export function createJarvisWebhookService(): JarvisWebhookService {
  return {
    async process(payload, companyId) {
      const startTime = Date.now();

      try {
        switch (payload.intent) {
          case "create_task":
            return await handleCreateTask(payload, companyId, startTime);

          case "status_update":
            return await handleStatusUpdate(payload, companyId, startTime);

          case "query":
            return handleQuery(payload, startTime);

          case "ping":
            return {
              success: true,
              eventId: payload.eventId,
              intent: "ping",
              action: "pong",
              processingMs: Date.now() - startTime,
            };

          default:
            return {
              success: false,
              eventId: payload.eventId,
              intent: payload.intent,
              error: `Unsupported intent: ${payload.intent}`,
              processingMs: Date.now() - startTime,
            };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          eventId: payload.eventId,
          intent: payload.intent,
          error: errorMessage,
          processingMs: Date.now() - startTime,
        };
      }
    },
  };
}

// ============================================================================
// Intent Handlers (uses Paperclip REST API internally)
// ============================================================================

async function handleCreateTask(
  payload: JarvisWebhookPayload,
  companyId: string,
  startTime: number,
): Promise<JarvisWebhookResponse> {
  const task = payload.task!;
  const apiUrl = getPaperclipApiUrl();

  const body = JSON.stringify({
    companyId,
    title: task.title,
    description:
      task.description ||
      `Created via JARVIS from Telegram message ${payload.source.messageId}` +
      ` (chat: ${payload.source.chatId}, user: ${payload.source.fromUser})`,
    status: "todo",
    priority: task.priority || "medium",
    assigneeAgentId: task.assigneeAgentId || null,
    parentId: task.parentId || null,
  });

  // Use fetch to call Paperclip API internally
  const response = await fetch(`${apiUrl}/companies/${companyId}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Paperclip API error ${response.status}: ${errorBody}`);
  }

  const issue = await response.json() as Record<string, unknown>;

  return {
    success: true,
    eventId: payload.eventId,
    intent: "create_task",
    action: "issue_created",
    issueId: issue.id as string,
    issueIdentifier: issue.identifier as string,
    processingMs: Date.now() - startTime,
  };
}

async function handleStatusUpdate(
  payload: JarvisWebhookPayload,
  companyId: string,
  startTime: number,
): Promise<JarvisWebhookResponse> {
  const update = payload.statusUpdate!;
  const apiUrl = getPaperclipApiUrl();

  // First, find the issue by identifier
  const listResponse = await fetch(
    `${apiUrl}/companies/${companyId}/issues?status=todo&status=in_progress&status=backlog&limit=500`,
  );

  if (!listResponse.ok) {
    throw new Error(`Paperclip API error fetching issues: ${listResponse.status}`);
  }

  const issues = await listResponse.json() as Record<string, unknown>[];
  const found = issues.find(
    (i) => (i as Record<string, unknown>).identifier === update.issueIdentifier,
  );

  if (!found) {
    return {
      success: false,
      eventId: payload.eventId,
      intent: "status_update",
      error: `Issue ${update.issueIdentifier} not found`,
      processingMs: Date.now() - startTime,
    };
  }

  const issueId = (found as Record<string, unknown>).id as string;

  if (update.newStatus) {
    const patchBody = JSON.stringify({ status: update.newStatus });
    const patchResponse = await fetch(`${apiUrl}/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: patchBody,
    });

    if (!patchResponse.ok) {
      throw new Error(`Paperclip API error updating issue: ${patchResponse.status}`);
    }

    if (update.comment) {
      const commentBody = JSON.stringify({ body: update.comment });
      await fetch(`${apiUrl}/issues/${issueId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: commentBody,
      });
    }
  }

  return {
    success: true,
    eventId: payload.eventId,
    intent: "status_update",
    action: update.newStatus ? `status_updated_to_${update.newStatus}` : "status_checked",
    issueId,
    issueIdentifier: update.issueIdentifier,
    processingMs: Date.now() - startTime,
  };
}

function handleQuery(
  payload: JarvisWebhookPayload,
  startTime: number,
): JarvisWebhookResponse {
  return {
    success: true,
    eventId: payload.eventId,
    intent: "query",
    action: "query_received",
    processingMs: Date.now() - startTime,
  };
}

// ============================================================================
// Export helpers for route
// ============================================================================

export { getJarvisSecret, getPaperclipApiUrl };
