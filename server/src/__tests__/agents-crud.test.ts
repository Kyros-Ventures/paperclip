/**
 * Agent CRUD tests (TEC-160)
 *
 * Mirrors the vi.mock + supertest + Express pattern used in
 * issues-lifecycle.test.ts to cover the core agent management
 * surface: create, read, list, update, and validation.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRoutes } from "../routes/agents.js";
import { errorHandler } from "../middleware/index.js";
import { HttpError } from "../errors.js";

const AGENT_ID = "55555555-5555-4555-8555-555555555555";
const COMPANY_ID = "66666666-6666-4666-8666-666666666666";

const baseAgent = {
  id: AGENT_ID,
  companyId: COMPANY_ID,
  name: "Engineer Bot",
  urlKey: "engineer-bot",
  role: "engineer",
  title: null,
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "http",
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
  createdAt: new Date("2026-05-22T00:00:00.000Z"),
  updatedAt: new Date("2026-05-22T00:00:00.000Z"),
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
const mockBudgetService = vi.hoisted(() => ({ upsertPolicy: vi.fn() }));
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
  companyService: () => ({}),
}));

function createDbStub(opts: { countResult?: number; companyExists?: boolean } = {}) {
  const { countResult = 1, companyExists = true } = opts;
  let callCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      callCount += 1;
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
  };
}

const localBoardActor = {
  type: "board",
  userId: "user-1",
  source: "local_implicit",
  isInstanceAdmin: true,
  companyIds: [COMPANY_ID],
};

function createApp(db: unknown = createDbStub()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = localBoardActor;
    next();
  });
  app.use("/api", agentRoutes(db as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();

  mockAgentService.getById.mockResolvedValue(baseAgent);
  mockAgentService.getChainOfCommand.mockResolvedValue([]);
  mockAgentService.create.mockResolvedValue(baseAgent);
  mockAgentService.update.mockResolvedValue(baseAgent);
  mockAgentService.list.mockResolvedValue([baseAgent]);

  mockAccessService.getMembership.mockResolvedValue(null);
  mockAccessService.listPrincipalGrants.mockResolvedValue([]);
  mockAccessService.ensureMembership.mockResolvedValue(undefined);
  mockAccessService.setPrincipalPermission.mockResolvedValue(undefined);

  mockBudgetService.upsertPolicy.mockResolvedValue(undefined);
  mockHeartbeatService.cancelActiveForAgent.mockResolvedValue(undefined);

  mockCompanySkillService.listRuntimeSkillEntries.mockResolvedValue([]);
  mockCompanySkillService.resolveRequestedSkillKeys.mockImplementation(
    async (_companyId: string, requested: string[]) => requested,
  );

  mockSecretService.normalizeAdapterConfigForPersistence.mockImplementation(
    async (_companyId: string, config: unknown) => config,
  );
  mockSecretService.resolveAdapterConfigForRuntime.mockImplementation(
    async (_companyId: string, config: unknown) => ({ config }),
  );

  mockAgentInstructionsService.materializeManagedBundle.mockImplementation(
    async (agent: Record<string, unknown>) => ({
      bundle: null,
      adapterConfig: (agent.adapterConfig as Record<string, unknown> | undefined) ?? {},
    }),
  );

  mockLogActivity.mockResolvedValue(undefined);
});

describe("POST /api/companies/:companyId/agents", () => {
  it("creates an agent with name, adapterType=http, role=engineer and returns 201", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({
        name: "Engineer Bot",
        role: "engineer",
        adapterType: "http",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: AGENT_ID,
      name: "Engineer Bot",
      urlKey: "engineer-bot",
      role: "engineer",
      adapterType: "http",
      status: "idle",
    });
    expect(mockAgentService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({
        name: "Engineer Bot",
        role: "engineer",
        adapterType: "http",
        status: "idle",
      }),
    );
  });

  it("returns 400 when name is missing", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ role: "engineer", adapterType: "http" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockAgentService.create).not.toHaveBeenCalled();
  });

  it("returns 400 when role is not one of the allowed values", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ name: "Rogue", role: "wizard", adapterType: "http" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockAgentService.create).not.toHaveBeenCalled();
  });

  it("accepts every valid AGENT_ROLES value", async () => {
    const roles = [
      "ceo",
      "cto",
      "cmo",
      "cfo",
      "engineer",
      "designer",
      "pm",
      "qa",
      "devops",
      "researcher",
      "general",
    ];
    for (const role of roles) {
      mockAgentService.create.mockResolvedValueOnce({ ...baseAgent, role });
      const res = await request(createApp())
        .post(`/api/companies/${COMPANY_ID}/agents`)
        .send({ name: `Bot-${role}`, role, adapterType: "http" });
      expect(res.status).toBe(201);
      expect(res.body.role).toBe(role);
    }
  });

  it("returns 409 when the derived urlKey collides with an existing agent", async () => {
    mockAgentService.create.mockRejectedValue(
      new HttpError(409, "Agent shortname 'engineer-bot' is already in use in this company"),
    );

    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/agents`)
      .send({ name: "Engineer Bot", role: "engineer", adapterType: "http" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/);
  });
});

describe("GET /api/agents/:id", () => {
  it("returns the agent with the expected core fields", async () => {
    const res = await request(createApp()).get(`/api/agents/${AGENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: AGENT_ID,
      companyId: COMPANY_ID,
      name: "Engineer Bot",
      urlKey: "engineer-bot",
      role: "engineer",
      adapterType: "http",
      status: "idle",
    });
    expect(res.body.chainOfCommand).toEqual([]);
    expect(res.body.access).toMatchObject({ canAssignTasks: false });
  });

  it("returns 404 when the agent does not exist", async () => {
    mockAgentService.getById.mockResolvedValue(null);
    const res = await request(createApp()).get(`/api/agents/${AGENT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Agent not found");
  });
});

describe("GET /api/companies/:companyId/agents", () => {
  it("returns the list of agents with pagination metadata", async () => {
    const res = await request(createApp()).get(`/api/companies/${COMPANY_ID}/agents`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: AGENT_ID, name: "Engineer Bot" });
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 500,
      total: 1,
      totalPages: 1,
    });
  });
});

describe("PATCH /api/agents/:id", () => {
  it("updates the agent status to paused and returns 200", async () => {
    mockAgentService.update.mockResolvedValue({ ...baseAgent, status: "paused" });

    const res = await request(createApp())
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ status: "paused" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paused");
    expect(mockAgentService.update).toHaveBeenCalledWith(
      AGENT_ID,
      expect.objectContaining({ status: "paused" }),
      expect.objectContaining({
        recordRevision: expect.objectContaining({ source: "patch" }),
      }),
    );
  });

  it("updates a nested adapterConfig field and returns the patched agent", async () => {
    const updatedConfig = { mode: "remote", endpoint: "https://example.test/agent" };
    mockAgentService.update.mockResolvedValue({ ...baseAgent, adapterConfig: updatedConfig });

    const res = await request(createApp())
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ adapterConfig: updatedConfig });

    expect(res.status).toBe(200);
    expect(res.body.adapterConfig).toMatchObject(updatedConfig);
    expect(mockAgentService.update).toHaveBeenCalledWith(
      AGENT_ID,
      expect.objectContaining({
        adapterConfig: expect.objectContaining(updatedConfig),
      }),
      expect.any(Object),
    );
  });

  it("updates runtimeConfig with a custom field", async () => {
    const runtimeConfig = { heartbeat: { enabled: true, intervalSec: 30 }, custom: "value" };
    mockAgentService.update.mockResolvedValue({ ...baseAgent, runtimeConfig });

    const res = await request(createApp())
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ runtimeConfig });

    expect(res.status).toBe(200);
    expect(res.body.runtimeConfig).toMatchObject(runtimeConfig);
  });

  it("returns 400 when status is not in AGENT_STATUSES", async () => {
    const res = await request(createApp())
      .patch(`/api/agents/${AGENT_ID}`)
      .send({ status: "inactive" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(mockAgentService.update).not.toHaveBeenCalled();
  });
});
