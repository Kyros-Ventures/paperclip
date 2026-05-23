/**
 * Tests for the outbound webhook service (TEC-167: Paperclip → Agent Bridge)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSignedPayload,
  buildIssuePayload,
  type OutboundWebhookPayload,
} from "../services/outbound-webhook.js";

describe("createSignedPayload", () => {
  const payload: OutboundWebhookPayload = {
    event: "issue.created",
    eventId: "evt-123",
    timestamp: "2026-05-15T14:00:00.000Z",
    issue: {
      id: "abc-123",
      identifier: "TEC-999",
      title: "Test issue",
      status: "todo",
      priority: "high",
      description: "A test",
      assigneeAgentId: "agent-1",
      parentId: null,
      companyId: "company-1",
      createdAt: "2026-05-15T14:00:00.000Z",
      updatedAt: "2026-05-15T14:00:00.000Z",
    },
  };

  it("produces JSON body and required headers", () => {
    const result = createSignedPayload(payload);

    expect(result.body).toBeTypeOf("string");
    const parsed = JSON.parse(result.body);
    expect(parsed.event).toBe("issue.created");
    expect(parsed.issue.title).toBe("Test issue");

    expect(result.headers["Content-Type"]).toBe("application/json");
    expect(result.headers["X-Webhook-Timestamp"]).toBeTypeOf("string");
    expect(result.headers["X-Webhook-Nonce"]).toBeTypeOf("string");
  });

  it("includes HMAC signature when WEBHOOK_SECRET is set", () => {
    process.env.WEBHOOK_SECRET = "test-secret";
    const result = createSignedPayload(payload);
    delete process.env.WEBHOOK_SECRET;

    expect(result.headers["X-Hub-Signature-256"]).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("omits HMAC signature when no secret is configured", () => {
    // Ensure no secret is set
    delete process.env.WEBHOOK_SECRET;
    delete process.env.PAPERCLIP_WEBHOOK_SECRET;

    const result = createSignedPayload(payload);
    expect(result.headers["X-Hub-Signature-256"]).toBeUndefined();
  });

  it("generates unique nonces for each call", () => {
    const r1 = createSignedPayload(payload);
    const r2 = createSignedPayload(payload);
    expect(r1.headers["X-Webhook-Nonce"]).not.toBe(r2.headers["X-Webhook-Nonce"]);
  });
});

describe("buildIssuePayload", () => {
  it("builds payload from issue data", () => {
    const issue = {
      id: "i-1",
      identifier: "TEC-100",
      title: "My Issue",
      status: "in_progress",
      priority: "medium",
      description: "desc",
      assigneeAgentId: "a-1",
      parentId: null,
      companyId: "c-1",
      createdAt: new Date("2026-05-15T14:00:00Z"),
      updatedAt: new Date("2026-05-15T14:00:00Z"),
    };

    const payload = buildIssuePayload("issue.created", issue);

    expect(payload.event).toBe("issue.created");
    expect(payload.issue.id).toBe("i-1");
    expect(payload.issue.identifier).toBe("TEC-100");
    expect(payload.issue.title).toBe("My Issue");
    expect(payload.eventId).toBeTypeOf("string");
    expect(payload.timestamp).toBeTypeOf("string");
  });

  it("handles null identifier", () => {
    const issue = {
      id: "i-2",
      identifier: null,
      title: "No ID",
      status: "todo",
      priority: "low",
      description: null,
      assigneeAgentId: null,
      parentId: null,
      companyId: "c-2",
      createdAt: "2026-05-15T14:00:00Z",
      updatedAt: "2026-05-15T14:00:00Z",
    };

    const payload = buildIssuePayload("issue.created", issue);
    expect(payload.issue.identifier).toBeNull();
    expect(payload.issue.title).toBe("No ID");
  });

  it("handles Date objects for timestamps", () => {
    const issue = {
      id: "i-3",
      identifier: "TEC-101",
      title: "Date Test",
      status: "todo",
      priority: "medium",
      description: null,
      assigneeAgentId: null,
      parentId: null,
      companyId: "c-3",
      createdAt: new Date("2026-05-15T14:00:00Z"),
      updatedAt: new Date("2026-05-15T15:00:00Z"),
    };

    const payload = buildIssuePayload("issue.created", issue);
    expect(payload.issue.createdAt).toBe("2026-05-15T14:00:00.000Z");
    expect(payload.issue.updatedAt).toBe("2026-05-15T15:00:00.000Z");
  });

  it("generates unique event IDs per call", () => {
    const issue = {
      id: "i-4",
      identifier: "TEC-102",
      title: "Event ID Test",
      status: "todo",
      priority: "medium",
      description: null,
      assigneeAgentId: null,
      parentId: null,
      companyId: "c-4",
      createdAt: "2026-05-15T14:00:00Z",
      updatedAt: "2026-05-15T14:00:00Z",
    };

    const p1 = buildIssuePayload("issue.created", issue);
    const p2 = buildIssuePayload("issue.created", issue);
    expect(p1.eventId).not.toBe(p2.eventId);
  });
});
