/**
 * Cost Events Integration Tests (TEC-160)
 * Covers POST /companies/:id/cost-events (reporting), GET aggregation
 * queries, validation errors, and authorization checks.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costRoutes } from "../routes/costs.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockIssueService = vi.hoisted(() => ({
  getByIdentifier: vi.fn(),
  getById: vi.fn(),
}));
const mockHeartbeatService = vi.hoisted(() => ({
  cancelBudgetScopeWork: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockFetchAllQuotaWindows = vi.hoisted(() => vi.fn());

const mockCostService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  summary: vi.fn(),
  byAgent: vi.fn(),
  byAgentModel: vi.fn(),
  byProvider: vi.fn(),
  byBiller: vi.fn(),
  windowSpend: vi.fn(),
  byProject: vi.fn(),
}));
const mockFinanceService = vi.hoisted(() => ({
  createEvent: vi.fn(),
  summary: vi.fn(),
  byBiller: vi.fn(),
  byKind: vi.fn(),
  list: vi.fn(),
}));
const mockBudgetService = vi.hoisted(() => ({
  overview: vi.fn(),
  upsertPolicy: vi.fn(),
  resolveIncident: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  budgetService: () => mockBudgetService,
  costService: () => mockCostService,
  financeService: () => mockFinanceService,
  companyService: () => mockCompanyService,
  agentService: () => mockAgentService,
  issueService: () => mockIssueService,
  heartbeatService: () => mockHeartbeatService,
  logActivity: mockLogActivity,
}));

vi.mock("../services/quota-windows.js", () => ({
  fetchAllQuotaWindows: mockFetchAllQuotaWindows,
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", costRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const localBoardActor = {
  type: "board",
  userId: "board-user",
  source: "local_implicit",
  isInstanceAdmin: true,
  companyIds: [COMPANY_ID],
};

function validCostPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId: AGENT_ID,
    provider: "openai",
    model: "gpt-4o-mini",
    inputTokens: 100,
    outputTokens: 50,
    costCents: 25,
    occurredAt: "2026-04-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockCostService.createEvent.mockResolvedValue({
    id: "cost-event-1",
    companyId: COMPANY_ID,
    agentId: AGENT_ID,
    provider: "openai",
    biller: "openai",
    billingType: "unknown",
    model: "gpt-4o-mini",
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 50,
    costCents: 25,
    occurredAt: new Date("2026-04-01T12:00:00.000Z"),
    createdAt: new Date("2026-04-01T12:00:00.000Z"),
  });
  mockCostService.summary.mockResolvedValue({ spendCents: 250 });
  mockCostService.byAgent.mockResolvedValue([
    { agentId: AGENT_ID, costCents: 250, eventCount: 5 },
  ]);
  mockCostService.byAgentModel.mockResolvedValue([]);
  mockCostService.byProvider.mockResolvedValue([{ provider: "openai", costCents: 250 }]);
  mockCostService.byBiller.mockResolvedValue([]);
  mockCostService.windowSpend.mockResolvedValue([]);
  mockCostService.byProject.mockResolvedValue([]);
  mockFetchAllQuotaWindows.mockResolvedValue([]);
  mockCompanyService.getById.mockResolvedValue({
    id: COMPANY_ID,
    name: "Paperclip",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
  });
  mockLogActivity.mockResolvedValue(undefined);
  mockIssueService.getByIdentifier.mockReset();
  mockIssueService.getById.mockReset();
});

describe("cost events: POST /companies/:id/cost-events", () => {
  it("creates a cost event with a valid payload", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "cost-event-1", agentId: AGENT_ID });
    expect(mockCostService.createEvent).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        agentId: AGENT_ID,
        provider: "openai",
        model: "gpt-4o-mini",
        costCents: 25,
        occurredAt: expect.any(Date),
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "cost.reported", entityType: "cost_event" }),
    );
  });

  it("defaults biller to provider when biller is omitted", async () => {
    await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload());

    expect(mockCostService.createEvent).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ biller: "openai" }),
    );
  });

  it("rejects negative costCents (400)", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload({ costCents: -10 }));

    expect(res.status).toBe(400);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("rejects missing required model field (400)", async () => {
    const { model: _model, ...payload } = validCostPayload();
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed occurredAt timestamp (400)", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload({ occurredAt: "yesterday" }));

    expect(res.status).toBe(400);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("rejects agent reporting cost for a different agent (403)", async () => {
    const app = createApp({
      type: "agent",
      agentId: "different-agent-id",
      companyId: COMPANY_ID,
      source: "agent_key",
    });

    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own costs/i);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("rejects board user from outside company (403)", async () => {
    const app = createApp({
      type: "board",
      userId: "stranger",
      source: "session",
      isInstanceAdmin: false,
      companyIds: ["other-company"],
    });

    const res = await request(app)
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validCostPayload());

    expect(res.status).toBe(403);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });
});

describe("cost events: aggregation queries", () => {
  it("returns spend summary for a company", async () => {
    const res = await request(createApp(localBoardActor)).get(
      `/api/companies/${COMPANY_ID}/costs/summary`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ spendCents: 250 });
    expect(mockCostService.summary).toHaveBeenCalledWith(COMPANY_ID, undefined);
  });

  it("passes a date range to summary aggregation", async () => {
    await request(createApp(localBoardActor))
      .get(`/api/companies/${COMPANY_ID}/costs/summary`)
      .query({ from: "2026-04-01T00:00:00.000Z", to: "2026-04-30T23:59:59.999Z" });

    expect(mockCostService.summary).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
    );
  });

  it("returns cost rollup by agent", async () => {
    const res = await request(createApp(localBoardActor)).get(
      `/api/companies/${COMPANY_ID}/costs/by-agent`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ agentId: AGENT_ID, costCents: 250 });
  });

  it("returns cost rollup by provider", async () => {
    const res = await request(createApp(localBoardActor)).get(
      `/api/companies/${COMPANY_ID}/costs/by-provider`,
    );
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ provider: "openai", costCents: 250 });
  });
});
