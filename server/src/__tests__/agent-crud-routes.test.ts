/**
 * Agent CRUD Integration Tests (TEC-160)
 * Covers create, detail, update (PATCH), list, status transitions, and validation
 * errors for the agents routes.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

const baseAgent = {
  id: AGENT_ID,
  companyId: COMPANY_ID,
  name: "Builder",
  urlKey: "builder",
  role: "engineer",
  title: "Builder",
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

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  terminate: vi.fn(),
  remove: vi.fn(),
  updatePermissions: vi.fn(),
  getChainOfCommand: vi.fn(),
  resolveByReference: vi.fn(),
  listKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeKey: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
  getMembership: vi.fn(),
  ensureMembership: vi.fn(),
  listPrincipalGrants: vi.fn(),
  setPrincipalPermission: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({}));
const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));
const mockHeartbeatService = vi.hoisted(() => ({
  cancelActiveForAgent: vi.fn(),
  listTaskSessions: vi.fn(),
  resetRuntimeSession: vi.fn(),
  getRuntimeState: vi.fn(),
}));
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
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
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

function createDbStub(opts: { listResult?: unknown[]; countResult?: number; companyExists?: boolean } = {}) {
  const { listResult = [baseAgent], countResult = 1, companyExists = true } = opts;
  let callCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callCount += 1;
      // First call is the company existence check; second is count(*)
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((cb: (rows: unknown[]) => unknown) =>
                cb(companyExists ? [{ id: COMPANY_ID }] : []),
              ),
            }),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((cb: (rows: unknown[]) => unknown) =>
              cb([{ count: countResult }]),
            ),
          }),
        }),
      };
    }),
    listResult,
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
  mockAgentService.create.mockResolvedValue(baseAgent);
  mockAgentService.update.mockResolvedValue(baseAgent);
  mockAgentService.list.mockResolvedValue([baseAgent]);
  mockAgentService.pause.mockResolvedValue({ ...baseAgent, status: "paused" });
  mockAgentService.resume.mockResolvedValue({ ...baseAgent, status: "idle" });
  mockAgentService.terminate.mockResolvedValue({ ...baseAgent, status: "terminated" });
  mockAgentService.remove.mockResolvedValue(baseAgent);
  mockAccessService.getMembership.mockResolvedValue(null);
  mockAccessService.listPrincipalGrants.mockResolvedValue([]);
  mockAccessService.ensureMembership.mockResolvedValue(undefined);
  mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);
  mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([]);
  mockCompanySkillService.resolveRequestedSkillKeys.mockImplementation(
    async (_companyId: string, requested: string[]) => requested,
  );
  mockBudgetService.upsertPolicy.mockResolvedValue(undefined);
  mockHeartbeatService.cancelActiveForAgent.mockResolvedValue(undefined);
  mockSecretService.normalizeAdapterConfigForPersistence.mockImplementation(
    async (_companyId: string, config: unknown) => config,
  );
  mockSecretService.resolveAdapterConfigForRuntime.mockImplementation(
    async (_companyId: string, config: unknown) => ({ config }),
  );
  mockAgentInstructionsService.materializeManagedBundle.mockImplementation(
    async (agent: Record<string, unknown>, _files: Record<string, string>) => ({
      bundle: null,
      adapterConfig: (agent.adapterConfig as Record<string, unknown> | undefined) ?? {},
    }),
  );
  mockLogActivity.mockResolvedValue(undefined);
});

describe("agent CRUD: create", () => {
  it("creates an agent via POST /companies/:id/agents", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({
        name: "Builder",
        role: "engineer",
        adapterType: "process",
        adapterConfig: {},
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: AGENT_ID, name: "Builder", role: "engineer" });
    expect(mockAgentService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ name: "Builder", role: "engineer", status: "idle" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "agent.created" }),
    );
  });

  it("rejects create when required name is missing (400)", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ role: "engineer" });

    expect(res.status).toBe(400);
    expect(mockAgentService.create).not.toHaveBeenCalled();
  });

  it("rejects create with invalid role enum (400)", async () => {
    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ name: "X", role: "not-a-real-role" });

    expect(res.status).toBe(400);
    expect(mockAgentService.create).not.toHaveBeenCalled();
  });

  it("upserts a budget policy when creating an agent with a monthly budget", async () => {
    mockAgentService.create.mockResolvedValue({ ...baseAgent, budgetMonthlyCents: 10_000 });

    const res = await request(createApp(localBoardActor))
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ name: "Builder", budgetMonthlyCents: 10_000 });

    expect(res.status).toBe(201);
    expect(mockBudgetService.upsertPolicy).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        scopeType: "agent",
        scopeId: AGENT_ID,
        amount: 10_000,
        windowKind: "calendar_month_utc",
      }),
      "board-user",
    );
  });
});

describe("agent CRUD: get and list", () => {
  it("returns agent detail with chainOfCommand and access state", async () => {
    const res = await request(createApp(localBoardActor)).get(`/api/agents/${AGENT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: AGENT_ID, name: "Builder" });
    expect(res.body.chainOfCommand).toEqual([]);
    expect(res.body.access).toMatchObject({ canAssignTasks: false });
  });

  it("returns 404 for unknown agent", async () => {
    mockAgentService.getById.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).get(`/api/agents/${AGENT_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 422 when listing agents with a non-UUID companyId", async () => {
    const res = await request(createApp(localBoardActor)).get(`/api/companies/not-uuid/agents`);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid company ID format/);
  });

  it("returns 404 when listing agents for a company that does not exist", async () => {
    const db = createDbStub({ companyExists: false }) as any;
    const res = await request(createApp(localBoardActor, db)).get(
      `/api/companies/${COMPANY_ID}/agents`,
    );
    expect(res.status).toBe(404);
  });

  it("lists agents with pagination metadata", async () => {
    const res = await request(createApp(localBoardActor)).get(
      `/api/companies/${COMPANY_ID}/agents`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
      pagination: expect.objectContaining({ page: 1, limit: 500, total: 1, totalPages: 1 }),
    });
  });
});

describe("agent CRUD: update via PATCH", () => {
  it("updates an agent's title and runtime config", async () => {
    mockAgentService.update.mockResolvedValue({ ...baseAgent, title: "Lead Builder" });

    const res = await request(createApp(localBoardActor))
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ title: "Lead Builder" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Lead Builder");
    expect(mockAgentService.update).toHaveBeenCalledWith(
      AGENT_ID,
      expect.objectContaining({ title: "Lead Builder" }),
      expect.objectContaining({
        recordRevision: expect.objectContaining({ source: "patch" }),
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "agent.updated" }),
    );
  });

  it("rejects PATCH that tries to set permissions (422)", async () => {
    const res = await request(createApp(localBoardActor))
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ permissions: { canCreateAgents: true } });

    expect(res.status).toBe(400);
    expect(mockAgentService.update).not.toHaveBeenCalled();
  });

  it("returns 404 when patching a missing agent", async () => {
    mockAgentService.getById.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor))
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("agent CRUD: status transitions (pause, resume, terminate)", () => {
  it("pauses an agent and cancels its active runs", async () => {
    const res = await request(createApp(localBoardActor)).post(`/api/agents/${AGENT_ID}/pause`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paused");
    expect(mockHeartbeatService.cancelActiveForAgent).toHaveBeenCalledWith(AGENT_ID);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "agent.paused" }),
    );
  });

  it("resumes a paused agent", async () => {
    const res = await request(createApp(localBoardActor)).post(`/api/agents/${AGENT_ID}/resume`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("idle");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "agent.resumed" }),
    );
  });

  it("terminates an agent and cancels its active runs", async () => {
    const res = await request(createApp(localBoardActor)).post(`/api/agents/${AGENT_ID}/terminate`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("terminated");
    expect(mockHeartbeatService.cancelActiveForAgent).toHaveBeenCalledWith(AGENT_ID);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "agent.terminated" }),
    );
  });

  it("returns 404 when pausing a missing agent", async () => {
    mockAgentService.pause.mockResolvedValue(null);
    const res = await request(createApp(localBoardActor)).post(`/api/agents/${AGENT_ID}/pause`);
    expect(res.status).toBe(404);
  });

  it("rejects pause from a non-board actor (403)", async () => {
    const res = await request(
      createApp({
        type: "agent",
        agentId: AGENT_ID,
        companyId: COMPANY_ID,
        source: "agent_key",
      }),
    ).post(`/api/agents/${AGENT_ID}/pause`);
    expect(res.status).toBe(403);
  });
});
