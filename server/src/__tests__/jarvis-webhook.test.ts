/**
 * Unit tests for JARVIS webhook dispatcher service.
 *
 * Tests payload validation, intent routing, and service responses.
 */

import { describe, it, expect } from "vitest";
import {
  validatePayload,
  createJarvisWebhookService,
  type JarvisWebhookPayload,
} from "../services/jarvis-webhook.js";

// ============================================================================
// Test Helpers
// ============================================================================

function makePayload(overrides: Partial<JarvisWebhookPayload> = {}): JarvisWebhookPayload {
  return {
    eventId: "evt-test-001",
    intent: "ping",
    source: {
      chatId: "-1001234567890",
      messageId: 42,
      fromUser: "testuser",
      timestamp: new Date().toISOString(),
    },
    ...overrides,
  };
}

/** Extract error message from validation result when invalid */
function getErr(result: ReturnType<typeof validatePayload>): string {
  return (result as { error: string }).error;
}

// ============================================================================
// Payload Validation
// ============================================================================

describe("validatePayload", () => {
  it("accepts a valid ping payload", () => {
    const result = validatePayload(makePayload({ intent: "ping" }));
    expect(result.valid).toBe(true);
  });

  it("accepts a valid create_task payload", () => {
    const result = validatePayload(
      makePayload({
        intent: "create_task",
        task: { title: "Fix login bug" },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a valid status_update payload", () => {
    const result = validatePayload(
      makePayload({
        intent: "status_update",
        statusUpdate: { issueIdentifier: "TEC-123" },
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a valid query payload", () => {
    const result = validatePayload(
      makePayload({ intent: "query", query: { text: "What is the status?" } }),
    );
    expect(result.valid).toBe(true);
  });

  it("rejects null payload", () => {
    const result = validatePayload(null);
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("JSON object");
  });

  it("rejects missing eventId", () => {
    const p = { ...makePayload() } as Partial<JarvisWebhookPayload>;
    delete p.eventId;
    const result = validatePayload(p);
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("eventId");
  });

  it("rejects invalid intent", () => {
    const result = validatePayload(
      makePayload({ intent: "delete_everything" as never }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("intent");
  });

  it("rejects missing source", () => {
    const p = { ...makePayload() } as Partial<JarvisWebhookPayload>;
    delete p.source;
    const result = validatePayload(p);
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("source");
  });

  it("rejects missing source.chatId", () => {
    const result = validatePayload(
      makePayload({ source: { chatId: "", messageId: 0, fromUser: "", timestamp: "" } }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("chatId");
  });

  it("rejects create_task without task data", () => {
    const result = validatePayload(
      makePayload({ intent: "create_task" }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("task data");
  });

  it("rejects create_task without task.title", () => {
    const result = validatePayload(
      makePayload({
        intent: "create_task",
        task: { title: "" },
      }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("title");
  });

  it("rejects status_update without statusUpdate data", () => {
    const result = validatePayload(
      makePayload({ intent: "status_update" }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("statusUpdate");
  });

  it("rejects status_update without issueIdentifier", () => {
    const result = validatePayload(
      makePayload({
        intent: "status_update",
        statusUpdate: { issueIdentifier: "" },
      }),
    );
    expect(result.valid).toBe(false);
    expect(getErr(result)).toContain("issueIdentifier");
  });
});

// ============================================================================
// Service Intent Routing
// ============================================================================

describe("createJarvisWebhookService", () => {
  const service = createJarvisWebhookService();
  const companyId = "29a857f9-3e94-460c-8a91-9e2ed41e7967";

  it("responds to ping with pong", async () => {
    const result = await service.process(makePayload({ intent: "ping" }), companyId);
    expect(result.success).toBe(true);
    expect(result.action).toBe("pong");
    expect(result.intent).toBe("ping");
  });

  it("acknowledges query intent", async () => {
    const result = await service.process(
      makePayload({ intent: "query", query: { text: "status?" } }),
      companyId,
    );
    expect(result.success).toBe(true);
    expect(result.action).toBe("query_received");
  });

  it("handles unsupported intent gracefully", async () => {
    const result = await service.process(
      makePayload({ intent: "unknown" as never }),
      companyId,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported");
  });

  it("handles create_task without Paperclip server (graceful error)", async () => {
    const result = await service.process(
      makePayload({
        intent: "create_task",
        task: { title: "Test issue from JARVIS" },
      }),
      companyId,
    );
    expect(result.intent).toBe("create_task");
    expect(typeof result.success).toBe("boolean");
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it("returns processing time", async () => {
    const result = await service.process(makePayload({ intent: "ping" }), companyId);
    expect(result.processingMs).toBeGreaterThanOrEqual(0);
  });

  it("includes eventId in response", async () => {
    const result = await service.process(
      makePayload({ eventId: "evt-custom-123", intent: "ping" }),
      companyId,
    );
    expect(result.eventId).toBe("evt-custom-123");
  });
});
