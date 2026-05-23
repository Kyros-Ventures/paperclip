/**
 * Issue Lifecycle Integration Tests (TEC-160)
 * Covers create, checkout, status transitions, comments, parent/child, filtering,
 * and error cases for the issues routes.
 */

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const mockIssueService = vi.hoisted(() => ({
  list: vi.fn(),
  listLabels: vi.fn(),
  createLabel: vi.fn(),
  deleteLabel: vi.fn(),
  getLabelById: vi.fn(),
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  getAncestors: vi.fn(),
  findMentionedProjectIds: vi.fn(),
  findMentionedAgents: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  checkout: vi.fn(),
  release: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
  getComment: vi.fn(),
  getCommentCursor: vi.fn(),
  assertCheckoutOwner: vi.fn(),
  listAttachments: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
  hasPermission: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
  reportRunActivity: vi.fn(),
  getRun: vi.fn(),
  getActiveRunForAgent: vi.fn(),
  cancelRun: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
  listByIds: vi.fn(),
}));

const mockGoalService = vi.hoisted(() => ({
  getById: vi.fn(),
  getDefaultCompanyGoal: vi.fn(),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(),
}));

const mockDocumentService = vi.hoisted(() => ({
  getIssueDocumentPayload: vi.fn(),
  listIssueDocuments: vi.fn(),
}));

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockRoutineService = vi.hoisted(() => ({
  syncRunStatusForIssue: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  createDependencyGraphService: () => ({}),
  documentService: () => mockDocumentService,
  executionWorkspaceService: () => mockExecutionWorkspaceService,
  goalService: () => mockGoalService,
  heartbeatService: () => mockHeartbeatService,
  issueApprovalService: () => ({}),
  issueService: () => mockIssueService,
  logActivity: mockLogActivity,
  projectService: () => mockProjectService,
  routineService: () => mockRoutineService,
  workProductService: () => mockWorkProductService,
}));

vi.mock("../services/notifications.js", () => ({
  notificationService: { notify: vi.fn() },
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: vi.fn(),
}));

vi.mock("../services/outbound-webhook.js", () => ({
  notifyAgent: vi.fn(async () => undefined),
}));

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ISSUE_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_ID = "33333333-3333-4333-8333-333333333333";
const AGENT_ID = "44444444-4444-4444-8444-444444444444";

function makeIssue(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ISSUE_ID,
    companyId: COMPANY_ID,
    identifier: "PAP-1",
    title: "Test issue",
    description: null,
    status: "todo",
    priority: "medium",
    projectId: null,
    goalId: null,
    parentId: null,
    assigneeAgentId: null,
    assigneeUserId: null,
    createdByUserId: "local-board",
    createdByAgentId: null,
    executionRunId: null,
    executionWorkspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function boardActor() {
  return {
    type: "board" as const,
    userId: "local-board",
    companyIds: [COMPANY_ID],
    source: "local_implicit",
    isInstanceAdmin: false,
  };
}

function createApp(actor = boardActor()) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockIssueService.getByIdentifier.mockResolvedValue(null);
  mockIssueService.findMentionedAgents.mockResolvedValue([]);
  mockIssueService.findMentionedProjectIds.mockResolvedValue([]);
  mockIssueService.getAncestors.mockResolvedValue([]);
  mockIssueService.listAttachments.mockResolvedValue([]);
  mockDocumentService.getIssueDocumentPayload.mockResolvedValue({});
  mockWorkProductService.listForIssue.mockResolvedValue([]);
  mockGoalService.getDefaultCompanyGoal.mockResolvedValue(null);
  mockHeartbeatService.wakeup.mockResolvedValue(undefined);
  mockHeartbeatService.reportRunActivity.mockResolvedValue(undefined);
  mockRoutineService.syncRunStatusForIssue.mockResolvedValue(undefined);
  mockAccessService.canUser.mockResolvedValue(true);
  mockAccessService.hasPermission.mockResolvedValue(true);
});

describe("issue lifecycle: create", () => {
  it("creates an issue via POST /companies/:id/issues and returns 201", async () => {
    const issue = makeIssue({ status: "backlog" });
    mockIssueService.create.mockResolvedValue(issue);

    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({ title: "New issue", priority: "high" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: ISSUE_ID, title: "Test issue" });
    expect(mockIssueService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ title: "New issue", priority: "high" }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.created" }),
    );
  });

  it("rejects create with 400 when title is missing", async () => {
    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({ priority: "medium" });

    expect(res.status).toBe(400);
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("rejects create when board user lacks access to the company", async () => {
    const res = await request(
      createApp({
        type: "board",
        userId: "stranger",
        companyIds: ["other-company"],
        source: "session",
        isInstanceAdmin: false,
      } as any),
    )
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({ title: "Hi" });

    expect(res.status).toBe(403);
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("creates a child issue with parentId set", async () => {
    const issue = makeIssue({ parentId: PARENT_ID });
    mockIssueService.create.mockResolvedValue(issue);

    const res = await request(createApp())
      .post(`/api/companies/${COMPANY_ID}/issues`)
      .send({ title: "Subtask", parentId: PARENT_ID });

    expect(res.status).toBe(201);
    expect(mockIssueService.create).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ parentId: PARENT_ID }),
    );
  });
});

describe("issue lifecycle: list and filter", () => {
  it("lists issues for a company with status filter", async () => {
    mockIssueService.list.mockResolvedValue([makeIssue({ status: "in_progress" })]);

    const res = await request(createApp())
      .get(`/api/companies/${COMPANY_ID}/issues`)
      .query({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockIssueService.list).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ status: "in_progress" }),
    );
  });

  it("filters by parentId for parent/child hierarchy queries", async () => {
    mockIssueService.list.mockResolvedValue([makeIssue({ parentId: PARENT_ID })]);

    const res = await request(createApp())
      .get(`/api/companies/${COMPANY_ID}/issues`)
      .query({ parentId: PARENT_ID });

    expect(res.status).toBe(200);
    expect(mockIssueService.list).toHaveBeenCalledWith(
      COMPANY_ID,
      expect.objectContaining({ parentId: PARENT_ID }),
    );
  });

  it("returns 400 with helpful error when companyId is missing from path", async () => {
    const res = await request(createApp()).get("/api/issues");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/companyId/i);
  });
});

describe("issue lifecycle: get", () => {
  it("returns issue detail with ancestors and project/goal context", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    const res = await request(createApp()).get(`/api/issues/${ISSUE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ISSUE_ID });
    expect(res.body.ancestors).toEqual([]);
    expect(res.body.workProducts).toEqual([]);
  });

  it("returns 404 when issue does not exist", async () => {
    mockIssueService.getById.mockResolvedValue(null);
    const res = await request(createApp()).get(`/api/issues/${ISSUE_ID}`);
    expect(res.status).toBe(404);
  });
});

describe("issue lifecycle: status transitions via PATCH", () => {
  it("transitions todo -> in_progress", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "todo" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "in_progress" }));

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(mockIssueService.update).toHaveBeenCalledWith(
      ISSUE_ID,
      expect.objectContaining({ status: "in_progress" }),
    );
  });

  it("transitions in_progress -> in_review", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "in_progress" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "in_review" }));

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "in_review" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_review");
  });

  it("transitions in_review -> done", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "in_review" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "done" }));

    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "done" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
  });

  it("rejects invalid status enum with 400 from validation middleware", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ status: "totally_bogus_status" });

    expect(res.status).toBe(400);
    expect(mockIssueService.update).not.toHaveBeenCalled();
  });

  it("returns 404 when patching a missing issue", async () => {
    mockIssueService.getById.mockResolvedValue(null);
    const res = await request(createApp())
      .patch(`/api/issues/${ISSUE_ID}`)
      .send({ title: "x" });
    expect(res.status).toBe(404);
  });
});

describe("issue lifecycle: checkout and release", () => {
  it("checks out an issue via POST /issues/:id/checkout", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "todo" }));
    mockIssueService.checkout.mockResolvedValue(
      makeIssue({ status: "in_progress", assigneeAgentId: AGENT_ID }),
    );

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/checkout`)
      .send({ agentId: AGENT_ID, expectedStatuses: ["todo"] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(mockIssueService.checkout).toHaveBeenCalledWith(
      ISSUE_ID,
      AGENT_ID,
      ["todo"],
      null,
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.checked_out" }),
    );
  });

  it("rejects checkout when project is paused (409)", async () => {
    const projectId = "55555555-5555-4555-8555-555555555555";
    mockIssueService.getById.mockResolvedValue(makeIssue({ projectId }));
    mockProjectService.getById.mockResolvedValue({
      id: projectId,
      pausedAt: new Date(),
      pauseReason: "budget",
    });

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/checkout`)
      .send({ agentId: AGENT_ID, expectedStatuses: ["todo"] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/paused/i);
    expect(mockIssueService.checkout).not.toHaveBeenCalled();
  });

  it("rejects when agent tries to check out as someone else (403)", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const app = createApp({
      type: "agent",
      agentId: "different-agent",
      companyId: COMPANY_ID,
      runId: "run-1",
      source: "agent_key",
    } as any);

    const res = await request(app)
      .post(`/api/issues/${ISSUE_ID}/checkout`)
      .send({ agentId: AGENT_ID, expectedStatuses: ["todo"] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/itself/i);
  });

  it("propagates a checkout conflict error from the service", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "in_progress" }));
    const conflict = Object.assign(new Error("Issue already checked out"), {
      status: 409,
    });
    mockIssueService.checkout.mockRejectedValue(conflict);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/checkout`)
      .send({ agentId: AGENT_ID, expectedStatuses: ["todo"] });

    expect(res.status).toBe(500);
  });

  it("releases an issue via POST /issues/:id/release", async () => {
    mockIssueService.getById.mockResolvedValue(
      makeIssue({ status: "in_progress", assigneeAgentId: AGENT_ID }),
    );
    mockIssueService.release.mockResolvedValue(
      makeIssue({ status: "todo", assigneeAgentId: null }),
    );

    const res = await request(createApp()).post(`/api/issues/${ISSUE_ID}/release`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("todo");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "issue.released" }),
    );
  });
});

describe("issue lifecycle: comments", () => {
  it("posts a comment via POST /issues/:id/comments", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    const comment = {
      id: "comment-1",
      issueId: ISSUE_ID,
      companyId: COMPANY_ID,
      body: "Looks good",
      authorUserId: "local-board",
      authorAgentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockIssueService.addComment.mockResolvedValue(comment);

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "Looks good" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "comment-1", body: "Looks good" });
    expect(mockIssueService.addComment).toHaveBeenCalledWith(
      ISSUE_ID,
      "Looks good",
      expect.objectContaining({ userId: "local-board" }),
    );
  });

  it("reopens a closed issue when reopen=true is sent with comment", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue({ status: "done" }));
    mockIssueService.update.mockResolvedValue(makeIssue({ status: "todo" }));
    mockIssueService.addComment.mockResolvedValue({
      id: "comment-2",
      issueId: ISSUE_ID,
      companyId: COMPANY_ID,
      body: "reopening",
      authorUserId: "local-board",
      authorAgentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "reopening", reopen: true });

    expect(res.status).toBe(201);
    expect(mockIssueService.update).toHaveBeenCalledWith(ISSUE_ID, { status: "todo" });
  });

  it("rejects empty comment body with 400", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());

    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "" });

    expect(res.status).toBe(400);
    expect(mockIssueService.addComment).not.toHaveBeenCalled();
  });

  it("lists comments for an issue", async () => {
    mockIssueService.getById.mockResolvedValue(makeIssue());
    mockIssueService.listComments.mockResolvedValue([
      { id: "c1", body: "first" },
      { id: "c2", body: "second" },
    ]);

    const res = await request(createApp()).get(`/api/issues/${ISSUE_ID}/comments`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns 404 when posting comment on missing issue", async () => {
    mockIssueService.getById.mockResolvedValue(null);
    const res = await request(createApp())
      .post(`/api/issues/${ISSUE_ID}/comments`)
      .send({ body: "hello" });
    expect(res.status).toBe(404);
  });
});
