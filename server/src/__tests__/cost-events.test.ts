/**
 * Cost event reporting tests (TEC-160)
 *
 * Focused companion to cost-events-routes.test.ts. Mirrors the vi.mock +
 * supertest pattern from issues-lifecycle.test.ts and agents-crud.test.ts
 * to cover report → aggregate → filter flows for cost events.
 *
 * Note: there is no GET /cost-events list endpoint; aggregation reads use
 * /costs/by-agent (which groups per-agent) and /costs/summary. The schema
 * field names are `inputTokens` / `outputTokens` on createCostEventSchema.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costRoutes } from "../routes/costs.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_AGENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
}));
const mockHeartbeatService = vi.hoisted(() => ({
  cancelBudgetScopeWork: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  budgetService: () => mockBudgetService,
  costService: () => mockCostService,
  financeService: () => mockFinanceService,
  companyService: () => mockCompanyService,
  agentService: () => mockAgentService,
  heartbeatService: () => mockHeartbeatService,
  logActivity: mockLogActivity,
  issueService: () => ({}),
}));

vi.mock("../services/quota-windows.js", () => ({
  fetchAllQuotaWindows: vi.fn(async () => []),
}));

const localBoardActor = {
  type: "board",
  userId: "user-1",
  source: "local_implicit",
  isInstanceAdmin: true,
  companyIds: [COMPANY_ID],
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = localBoardActor;
    next();
  });
  app.use("/api", costRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function makeCostEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    companyId: COMPANY_ID,
    agentId: AGENT_ID,
    provider: "openai",
    biller: "openai",
    billingType: "unknown",
    model: "gpt-4o-mini",
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 250,
    costCents: 42,
    occurredAt: new Date("2026-05-01T12:00:00.000Z"),
    createdAt: new Date("2026-05-01T12:00:00.000Z"),
    ...overrides,
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    agentId: AGENT_ID,
    provider: "openai",
    model: "gpt-4o-mini",
    inputTokens: 1000,
    outputTokens: 250,
    costCents: 42,
    occurredAt: "2026-05-01T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockCostService.createEvent.mockResolvedValue(makeCostEvent());
  mockCostService.byAgent.mockResolvedValue([
    { agentId: AGENT_ID, costCents: 42, eventCount: 1 },
  ]);
  mockCostService.summary.mockResolvedValue({ spendCents: 42 });
  mockLogActivity.mockResolvedValue(undefined);
});

describe("cost event report (POST /companies/:companyId/cost-events)", () => {
  it("returns 201 with the created cost event", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validPayload());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: "evt-1",
      agentId: AGENT_ID,
      provider: "openai",
      model: "gpt-4o-mini",
      costCents: 42,
    });
    expect(mockCostService.createEvent).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        agentId: AGENT_ID,
        provider: "openai",
        model: "gpt-4o-mini",
        costCents: 42,
        inputTokens: 1000,
        outputTokens: 250,
        occurredAt: expect.any(Date),
      }),
    );
  });
});

describe("cost event aggregation (GET /companies/:companyId/costs/by-agent)", () => {
  it("returns an array of per-agent rollups", async () => {
    const res = await request(createApp()).get(
      `/api/companies/${COMPANY_ID}/costs/by-agent`,
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({ agentId: AGENT_ID, costCents: 42 });
  });

  it("scopes the rollup to a specific agent when the service returns only that row", async () => {
    mockCostService.byAgent.mockResolvedValue([
      { agentId: AGENT_ID, costCents: 42, eventCount: 1 },
    ]);

    const res = await request(createApp())
      .get(`/api/companies/${COMPANY_ID}/costs/by-agent`)
      .query({ from: "2026-05-01T00:00:00.000Z", to: "2026-05-31T23:59:59.999Z" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body.every((row: { agentId: string }) => row.agentId === AGENT_ID)).toBe(true);
    expect(mockCostService.byAgent).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
    );
  });
});

describe("cost event validation", () => {
  it("returns 400 when costCents is negative", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(validPayload({ costCents: -1 }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when required agentId is missing", async () => {
    const { agentId: _agentId, ...payload } = validPayload();
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when required provider is missing", async () => {
    const { provider: _provider, ...payload } = validPayload();
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when required costCents is missing", async () => {
    const { costCents: _costCents, ...payload } = validPayload();
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/cost-events`)
      .send(payload);

    expect(res.status).toBe(400);
    expect(mockCostService.createEvent).not.toHaveBeenCalled();
  });
});

describe("multiple cost events", () => {
  it("creates three cost events and reflects the count in the by-agent rollup", async () => {
    const events = [
      makeCostEvent({ id: "evt-1", costCents: 10, inputTokens: 200, outputTokens: 50 }),
      makeCostEvent({ id: "evt-2", costCents: 20, inputTokens: 400, outputTokens: 100 }),
      makeCostEvent({
        id: "evt-3",
        agentId: OTHER_AGENT_ID,
        costCents: 30,
        inputTokens: 600,
        outputTokens: 150,
      }),
    ];

    mockCostService.createEvent
      .mockResolvedValueOnce(events[0])
      .mockResolvedValueOnce(events[1])
      .mockResolvedValueOnce(events[2]);

    const app = createApp();

    for (const event of events) {
      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/cost-events`)
        .send(
          validPayload({
            agentId: event.agentId,
            costCents: event.costCents,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
          }),
        );
      expect(res.status).toBe(201);
    }

    expect(mockCostService.createEvent).toHaveBeenCalledTimes(3);

    mockCostService.byAgent.mockResolvedValue([
      { agentId: AGENT_ID, costCents: 30, eventCount: 2 },
      { agentId: OTHER_AGENT_ID, costCents: 30, eventCount: 1 },
    ]);

    const listRes = await request(app).get(
      `/api/companies/${COMPANY_ID}/costs/by-agent`,
    );

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(2);
    const totalEvents = listRes.body.reduce(
      (sum: number, row: { eventCount: number }) => sum + row.eventCount,
      0,
    );
    expect(totalEvents).toBe(3);
  });
});
