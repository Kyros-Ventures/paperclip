/**
 * Heartbeat Lifecycle Tests (TEC-160)
 *
 * Focuses on the create-run lifecycle invoked through POST
 * /api/agents/:agentId/heartbeat/invoke: verifying run record shape,
 * propagation of agent/status fields, separate records for repeated invokes,
 * and 404 behavior for missing agents.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const AGENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPANY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_ID_1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RUN_ID_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MISSING_AGENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function makeAgent(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-05-22T00:00:00.000Z");
  return {
    id: AGENT_ID,
    companyId: COMPANY_ID,
    name: "Lifecycle worker",
    urlKey: "lifecycle-worker",
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID_1,
    agentId: AGENT_ID,
    companyId: COMPANY_ID,
    status: "queued",
    invocationSource: "on_demand",
    triggerDetail: "manual",
    startedAt: new Date("2026-05-22T00:00:01.000Z"),
    finishedAt: null,
    contextSnapshot: { triggeredBy: "user" },
    createdAt: new Date("2026-05-22T00:00:01.000Z"),
    ...overrides,
  };
}

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

const boardActor = {
  type: "board",
  userId: "board-user",
  source: "local_implicit",
  isInstanceAdmin: true,
  companyIds: [COMPANY_ID],
};

function createApp(actor: Record<string, unknown> = boardActor) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentRoutes(createDbStub() as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAgentService.getById.mockResolvedValue(makeAgent());
  mockAgentService.getChainOfCommand.mockResolvedValue([]);
  mockAccessService.getMembership.mockResolvedValue(null);
  mockAccessService.listPrincipalGrants.mockResolvedValue([]);
  mockHeartbeatService.invoke.mockResolvedValue(makeRun());
  mockInstanceSettingsService.getGeneral.mockResolvedValue({ censorUsernameInLogs: false });
  mockLogActivity.mockResolvedValue(undefined);
});

describe("heartbeat lifecycle: invoke creates run", () => {
  it("creates a run record and returns it with status queued", async () => {
    const run = makeRun({ status: "queued" });
    mockHeartbeatService.invoke.mockResolvedValue(run);

    const res = await request(createApp()).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      id: RUN_ID_1,
      status: "queued",
      agentId: AGENT_ID,
    });
    expect(mockHeartbeatService.invoke).toHaveBeenCalledTimes(1);
    expect(mockHeartbeatService.invoke).toHaveBeenCalledWith(
      AGENT_ID,
      "on_demand",
      expect.objectContaining({ triggeredBy: "board" }),
      "manual",
      expect.objectContaining({ actorType: "user", actorId: "board-user" }),
    );
  });

  it("includes id, status, agentId, and startedAt in the response", async () => {
    const startedAt = new Date("2026-05-22T12:34:56.000Z");
    mockHeartbeatService.invoke.mockResolvedValue(makeRun({ startedAt }));

    const res = await request(createApp()).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: RUN_ID_1,
        status: "queued",
        agentId: AGENT_ID,
        startedAt: startedAt.toISOString(),
      }),
    );
  });

  it("records a heartbeat.invoked activity entry when a run is created", async () => {
    await request(createApp()).post(`/api/agents/${AGENT_ID}/heartbeat/invoke`);

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "heartbeat.invoked",
        entityType: "heartbeat_run",
        entityId: RUN_ID_1,
        details: { agentId: AGENT_ID },
      }),
    );
  });
});

describe("heartbeat lifecycle: multiple invocations", () => {
  it("returns separate run records when invoked twice for the same agent", async () => {
    const firstRun = makeRun({ id: RUN_ID_1, status: "queued" });
    const secondRun = makeRun({ id: RUN_ID_2, status: "queued" });

    mockHeartbeatService.invoke
      .mockResolvedValueOnce(firstRun)
      .mockResolvedValueOnce(secondRun);

    const app = createApp();

    const first = await request(app).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );
    const second = await request(app).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(first.body.id).toBe(RUN_ID_1);
    expect(second.body.id).toBe(RUN_ID_2);
    expect(first.body.id).not.toBe(second.body.id);
    expect(mockHeartbeatService.invoke).toHaveBeenCalledTimes(2);
  });

  it("reports skipped status when the service declines to create a run", async () => {
    mockHeartbeatService.invoke.mockResolvedValue(null);

    const res = await request(createApp()).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: "skipped" });
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "heartbeat.invoked" }),
    );
  });
});

describe("heartbeat lifecycle: error paths", () => {
  it("returns 404 when the target agent does not exist", async () => {
    mockAgentService.getById.mockResolvedValue(null);

    const res = await request(createApp()).post(
      `/api/agents/${MISSING_AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Agent not found");
    expect(mockHeartbeatService.invoke).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("rejects with 403 when an agent attempts to invoke a different agent", async () => {
    const agentActor = {
      type: "agent",
      agentId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      companyId: COMPANY_ID,
      source: "agent_key",
    };

    const res = await request(createApp(agentActor)).post(
      `/api/agents/${AGENT_ID}/heartbeat/invoke`,
    );

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/itself/i);
    expect(mockHeartbeatService.invoke).not.toHaveBeenCalled();
  });
});
