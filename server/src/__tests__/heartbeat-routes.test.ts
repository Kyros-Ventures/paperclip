/**
 * Heartbeat Route Integration Tests (TEC-160)
 * Covers heartbeat invoke (creates run), heartbeat run detail / list, cancel
 * transitions, and error paths.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

const baseAgent = {
  id: AGENT_ID,
  companyId: COMPANY_ID,
  name: "Worker",
  urlKey: "worker",
  role: "engineer",
  title: "Worker",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "process",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: false },
  webhookUrl: null,
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
  updatedAt: new Date("2026-03-19T00:00:00.000Z"),
};

const baseRun = {
  id: RUN_ID,
  agentId: AGENT_ID,
  companyId: COMPANY_ID,
  status: "queued",
  invocationSource: "on_demand",
  triggerDetail: "manual",
  startedAt: null,
  finishedAt: null,
  contextSnapshot: { triggeredBy: "user" },
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
};

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  terminate: vi.fn(),
  remove: vi.fn(),
  getChainOfCommand: vi.fn(),
  resolveByReference: vi.fn(),
  updatePermissions: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  invoke: vi.fn(),
  wakeup: vi.fn(),
  cancelActiveForAgent: vi.fn(),
  cancelRun: vi.fn(),
  getRun: vi.fn(),
  list: vi.fn(),
  listEvents: vi.fn(),
  readLog: vi.fn(),
  getRuntimeState: vi.fn(),
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
}));

const mockInstanceSettingsService = vi.hoisted(() => ({
  getGeneral: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({}));
const mockBudgetService = vi.hoisted(() => ({ upsertPolicy: vi.fn() }));
const mockIssueApprovalService = vi.hoisted(() => ({}));
const mockIssueService = vi.hoisted(() => ({ list: vi.fn() }));
const mockSecretService = vi.hoisted(() => ({
  normalizeAdapterConfigForPersistence: vi.fn(),
  resolveAdapterConfigForRuntime: vi.fn(),
}));
const mockAgentInstructionsService = vi.hoisted(() => ({
  materializeManagedBundle: vi.fn(),
}));
const mockCompanySkillService = vi.hoisted(() => ({
  listRuntimeSkillEntries: vi.fn(),
  resolveRequestedSkillKeys: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({
  listForRun: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  agentService: () => mockAgentService,
  agentInstructionsService: () => mockAgentInstructionsService,
  accessService: () => mockAccessService,
  approvalService: () => mockApprovalService,
  companySkillService: () => mockCompanySkillService,
  budgetService: () => mockBudgetService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => mockIssueApprovalService,
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  secretService: () => mockSecretService,
  syncInstructionsBundleConfigFromFilePath: vi.fn((_agent, config) => config),
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => mockInstanceSettingsService,
}));

function createDbStub() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
        where: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((cb: (rows: unknown[]) => unknown) =>
            cb([{ id: COMPANY_ID }]),
          ),
        }),
      }),
    }),
  };
}

function createApp(actor: Record<string, unknown>, db = createDbStub() as any) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentRoutes(db));
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

beforeEach(() => {
  mockAgentService.getById.mockResolvedValue(baseAgent);
  mockAgentService.getChainOfCommand.mockResolvedValue([]);
  mockAccessService.getMembership.mockResolvedValue(null);
  mockAccessService.listPrincipalGrants.mockResolvedValue([]);
  mockHeartbeatService.invoke.mockResolvedValue(baseRun);
  mockHeartbeatService.cancelRun.mockResolvedValue({ ...baseRun, status: "cancelled" });
  mockHeartbeatService.getRun.mockResolvedValue(baseRun);
  mockHeartbeatService.list.mockResolvedValue([baseRun]);
  mockHeartbeatService.listEvents.mockResolvedValue([]);
  mockHeartbeatService.readLog.mockResolvedValue({ bytesRead: 0, content: "", offset: 0, eof: true });
  mockInstanceSettingsService.getGeneral.mockResolvedValue({ censorUsernameInLogs: false });
  mockWorkspaceOperationService.listForRun.mockResolvedValue([]);
  mockSecretService.normalizeAdapterConfigForPersistence.mockImplementation(
    async (_companyId: string, config: unknown) => config,
  );
  mockSecretService.resolveAdapterConfigForRuntime.mockImplementation(
    async (_companyId: string, config: unknown) => ({ config }),
  );
  mockLogActivity.mockResolvedValue(undefined);
});

describe("heartbeat: invoke", () => {
  it("invokes a run via POST /agents/:id/heartbeat/invoke and returns 202", async () => {
    const res = await request(createApp(localBoardActor)).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ id: RUN_ID, status: "queued" });
    expect(mockHeartbeatService.invoke).toHaveBeenCalledWith(
      AGENT_ID,
      "on_demand",
      expect.objectContaining({ triggeredBy: "board" }),
      "manual",
      expect.objectContaining({ actorType: "user", actorId: "board-user" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "heartbeat.invoked", entityType: "heartbeat_run" }),
    );
  });

  it("returns 202 with skipped status when service declines to invoke", async () => {
    mockHeartbeatService.invoke.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "skipped" });
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "heartbeat.invoked" }),
    );
  });

  it("returns 404 when invoking heartbeat for missing agent", async () => {
    mockAgentService.getById.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );
    expect(res.status).toBe(404);
    expect(mockHeartbeatService.invoke).not.toHaveBeenCalled();
  });

  it("rejects when an agent tries to invoke a different agent (403)", async () => {
    const app = createApp({
      type: "agent",
      agentId: "different-agent",
      companyId: COMPANY_ID,
      source: "agent_key",
    });

    const res = await request(app).post(`/api/agents/${AGENT_ID}/heartbeat/invoke`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/itself/i);
    expect(mockHeartbeatService.invoke).not.toHaveBeenCalled();
  });
});

describe("heartbeat: run detail and listing", () => {
  it("returns a heartbeat run by id", async () => {
    const res = await request(createApp(localBoardActor)).get(`/api/heartbeat-runs/${RUN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: RUN_ID, status: "queued" });
  });

  it("returns 404 when heartbeat run is missing", async () => {
    mockHeartbeatService.getRun.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).get(`/api/heartbeat-runs/${RUN_ID}`);
    expect(res.status).toBe(404);
  });

  it("lists heartbeat runs for a company", async () => {
    const res = await request(createApp(localBoardActor)).get(
      `/api/companies/${COMPANY_ID}/heartbeat-runs`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockHeartbeatService.list).toHaveBeenCalledWith(COMPANY_ID, undefined, undefined);
  });

  it("filters heartbeat run listing by agentId and limit", async () => {
    await request(createApp(localBoardActor))
      .get(`/api/companies/${COMPANY_ID}/heartbeat-runs`)
      .query({ agentId: AGENT_ID, limit: "50" });

    expect(mockHeartbeatService.list).toHaveBeenCalledWith(COMPANY_ID, AGENT_ID, 50);
  });

  it("returns run events list", async () => {
    mockHeartbeatService.listEvents.mockResolvedValue([
      { id: "evt-1", runId: RUN_ID, seq: 1, type: "log", payload: {} },
    ]);

    const res = await request(createApp(localBoardActor)).get(
      `/api/heartbeat-runs/${RUN_ID}/events`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("heartbeat: cancel transitions", () => {
  it("cancels a run via POST /heartbeat-runs/:runId/cancel", async () => {
    const res = await request(createApp(localBoardActor)).post(
      `/api/heartbeat-runs/${RUN_ID}/cancel`,
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "heartbeat.cancelled",
        entityType: "heartbeat_run",
      }),
    );
  });

  it("rejects cancel from a non-board actor (403)", async () => {
    const app = createApp({
      type: "agent",
      agentId: AGENT_ID,
      companyId: COMPANY_ID,
      source: "agent_key",
    });

    const res = await request(app).post(`/api/heartbeat-runs/${RUN_ID}/cancel`);
    expect(res.status).toBe(403);
    expect(mockHeartbeatService.cancelRun).not.toHaveBeenCalled();
  });

  it("returns null body when cancelling an already-finished run", async () => {
    mockHeartbeatService.cancelRun.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).post(
      `/api/heartbeat-runs/${RUN_ID}/cancel`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "heartbeat.cancelled" }),
    );
  });
});
