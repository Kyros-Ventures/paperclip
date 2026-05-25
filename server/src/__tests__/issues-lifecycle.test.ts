import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ISSUE_ID = "22222222-2222-4222-8222-222222222222";
const CHILD_ISSUE_ID = "33333333-3333-4333-8333-333333333333";
const AGENT_ID = "44444444-4444-4444-8444-444444444444";

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
  getById: vi.fn(),
  getByIdentifier: vi.fn(),
  update: vi.fn(),
  checkout: vi.fn(),
  release: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
  getComment: vi.fn(),
  findMentionedAgents: vi.fn(async () => []),
  findMentionedProjectIds: vi.fn(async () => []),
  getAncestors: vi.fn(async () => []),
  listAttachments: vi.fn(async () => []),
  assertCheckoutOwner: vi.fn(async () => ({ adoptedFromRunId: null })),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(async () => undefined),
  reportRunActivity: vi.fn(async () => undefined),
  getRun: vi.fn(async () => null),
  getActiveRunForAgent: vi.fn(async () => null),
  cancelRun: vi.fn(async () => null),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(async () => null),
}));

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(async () => null),
  listByIds: vi.fn(async () => []),
}));

const mockGoalService = vi.hoisted(() => ({
  getById: vi.fn(async () => null),
  getDefaultCompanyGoal: vi.fn(async () => null),
}));

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  getById: vi.fn(async () => null),
}));

const mockWorkProductService = vi.hoisted(() => ({
  listForIssue: vi.fn(async () => []),
}));

const mockDocumentService = vi.hoisted(() => ({
  getIssueDocumentPayload: vi.fn(async () => ({})),
}));

const mockRoutineService = vi.hoisted(() => ({
  syncRunStatusForIssue: vi.fn(async () => undefined),
}));

const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(async () => true),
  hasPermission: vi.fn(async () => true),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(async () => undefined));

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
  companyService: () => ({}),
  companySearchService: () => ({}),
  issueRecoveryActionService: () => ({}),
  issueThreadInteractionService: () => ({}),
  issueReferenceService: () => ({}),
}));

vi.mock("../services/workflow.js", () => ({
  createWorkflowService: () => ({}),
}));

vi.mock("../services/notifications.js", () => ({
  notificationService: () => ({}),
}));

vi.mock("../services/issue-assignment-wakeup.js", () => ({
  queueIssueAssignmentWakeup: vi.fn(async () => undefined),
}));

vi.mock("../services/outbound-webhook.js", () => ({
  notifyAgent: vi.fn(async () => undefined),
}));

function makeIssue(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: ISSUE_ID,
    companyId: COMPANY_ID,
    identifier: "PAP-1",
    title: "Test issue",
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: null,
    assigneeUserId: null,
    createdByAgentId: null,
    createdByUserId: "user-1",
    parentId: null,
    projectId: null,
    goalId: null,
    checkoutRunId: null,
    executionRunId: null,
    startedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: [COMPANY_ID],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", issueRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

describe("issues lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIssueService.findMentionedAgents.mockResolvedValue([]);
    mockIssueService.findMentionedProjectIds.mockResolvedValue([]);
    mockIssueService.getAncestors.mockResolvedValue([]);
    mockIssueService.listAttachments.mockResolvedValue([]);
    mockIssueService.assertCheckoutOwner.mockResolvedValue({ adoptedFromRunId: null });
    mockHeartbeatService.wakeup.mockResolvedValue(undefined);
    mockHeartbeatService.reportRunActivity.mockResolvedValue(undefined);
    mockRoutineService.syncRunStatusForIssue.mockResolvedValue(undefined);
    mockDocumentService.getIssueDocumentPayload.mockResolvedValue({});
    mockWorkProductService.listForIssue.mockResolvedValue([]);
    mockProjectService.listByIds.mockResolvedValue([]);
  });

  describe("POST /api/companies/:companyId/issues", () => {
    it("creates an issue and returns 201 with an identifier", async () => {
      const created = makeIssue({ title: "Fix login bug", priority: "high", status: "todo" });
      mockIssueService.create.mockResolvedValue(created);

      const res = await request(createApp())
        .post(`/api/companies/${COMPANY_ID}/issues`)
        .send({ title: "Fix login bug", priority: "high", status: "todo" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: ISSUE_ID,
        title: "Fix login bug",
        priority: "high",
        status: "todo",
        identifier: "PAP-1",
      });
      expect(mockIssueService.create).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ title: "Fix login bug", priority: "high", status: "todo" }),
      );
    });

    it("returns 400 when required title is missing", async () => {
      const res = await request(createApp())
        .post(`/api/companies/${COMPANY_ID}/issues`)
        .send({ priority: "high" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
      expect(mockIssueService.create).not.toHaveBeenCalled();
    });

    it("creates a child issue and persists parentId", async () => {
      const parent = makeIssue({ id: ISSUE_ID, title: "Parent" });
      const child = makeIssue({
        id: CHILD_ISSUE_ID,
        identifier: "PAP-2",
        title: "Child task",
        parentId: parent.id,
      });
      mockIssueService.create.mockResolvedValue(child);

      const res = await request(createApp())
        .post(`/api/companies/${COMPANY_ID}/issues`)
        .send({ title: "Child task", parentId: parent.id });

      expect(res.status).toBe(201);
      expect(res.body.parentId).toBe(parent.id);
      expect(mockIssueService.create).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ parentId: parent.id }),
      );
    });
  });

  describe("GET /api/issues/:id", () => {
    it("returns the issue with its enriched fields", async () => {
      const issue = makeIssue({ title: "Inspect login" });
      mockIssueService.getById.mockResolvedValue(issue);

      const res = await request(createApp()).get(`/api/issues/${ISSUE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: issue.id,
        title: "Inspect login",
        identifier: "PAP-1",
        status: "todo",
      });
      expect(mockIssueService.getById).toHaveBeenCalledWith(ISSUE_ID);
    });

    it("returns 404 when issue does not exist", async () => {
      mockIssueService.getById.mockResolvedValue(null);

      const res = await request(createApp()).get(`/api/issues/${ISSUE_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Issue not found");
    });
  });

  describe("PATCH /api/issues/:id", () => {
    it("updates the status to in_progress", async () => {
      const existing = makeIssue({ status: "todo" });
      const updated = { ...existing, status: "in_progress" };
      mockIssueService.getById.mockResolvedValue(existing);
      mockIssueService.update.mockResolvedValue(updated);

      const res = await request(createApp())
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "in_progress" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("in_progress");
      expect(mockIssueService.update).toHaveBeenCalledWith(ISSUE_ID, { status: "in_progress" });
    });

    it("returns 400 when status is invalid", async () => {
      const res = await request(createApp())
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "not_a_real_status" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation error");
      expect(mockIssueService.update).not.toHaveBeenCalled();
    });

    it("walks an issue through todo → in_progress → done", async () => {
      const todo = makeIssue({ status: "todo" });
      const inProgress = { ...todo, status: "in_progress" };
      const done = { ...todo, status: "done" };

      mockIssueService.getById
        .mockResolvedValueOnce(todo)
        .mockResolvedValueOnce(inProgress);
      mockIssueService.update
        .mockResolvedValueOnce(inProgress)
        .mockResolvedValueOnce(done);

      const app = createApp();

      const first = await request(app)
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "in_progress" });
      expect(first.status).toBe(200);
      expect(first.body.status).toBe("in_progress");

      const second = await request(app)
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "done" });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("done");

      expect(mockIssueService.update).toHaveBeenNthCalledWith(1, ISSUE_ID, { status: "in_progress" });
      expect(mockIssueService.update).toHaveBeenNthCalledWith(2, ISSUE_ID, { status: "done" });
    });
  });

  describe("POST /api/issues/:id/comments", () => {
    it("posts a comment and includes it when listing comments", async () => {
      const issue = makeIssue();
      const comment = {
        id: "comment-1",
        issueId: issue.id,
        companyId: issue.companyId,
        body: "Looking into this now",
        createdAt: new Date(),
        updatedAt: new Date(),
        authorAgentId: null,
        authorUserId: "user-1",
      };
      mockIssueService.getById.mockResolvedValue(issue);
      mockIssueService.addComment.mockResolvedValue(comment);
      mockIssueService.listComments.mockResolvedValue([comment]);

      const app = createApp();
      const postRes = await request(app)
        .post(`/api/issues/${ISSUE_ID}/comments`)
        .send({ body: "Looking into this now" });

      expect(postRes.status).toBe(201);
      expect(postRes.body).toMatchObject({
        id: comment.id,
        body: "Looking into this now",
        issueId: issue.id,
      });

      const listRes = await request(app).get(`/api/issues/${ISSUE_ID}/comments`);
      expect(listRes.status).toBe(200);
      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0]).toMatchObject({ id: comment.id, body: "Looking into this now" });
    });
  });

  describe("create → checkout → work → complete lifecycle", () => {
    it("walks an issue end-to-end through checkout and completion", async () => {
      const created = makeIssue({ status: "todo", assigneeAgentId: AGENT_ID });
      const checkedOut = { ...created, status: "in_progress", checkoutRunId: null };
      const done = { ...created, status: "done" };

      mockIssueService.create.mockResolvedValue(created);
      mockIssueService.checkout.mockResolvedValue(checkedOut);
      mockIssueService.getById
        .mockResolvedValueOnce(created) // for checkout
        .mockResolvedValueOnce(checkedOut); // for final patch to done
      mockIssueService.update.mockResolvedValue(done);

      const app = createApp();

      const createRes = await request(app)
        .post(`/api/companies/${COMPANY_ID}/issues`)
        .send({ title: "Lifecycle task", status: "todo", assigneeAgentId: AGENT_ID });
      expect(createRes.status).toBe(201);
      expect(createRes.body.status).toBe("todo");

      const checkoutRes = await request(app)
        .post(`/api/issues/${ISSUE_ID}/checkout`)
        .send({ agentId: AGENT_ID, expectedStatuses: ["todo"] });
      expect(checkoutRes.status).toBe(200);
      expect(checkoutRes.body.status).toBe("in_progress");

      const completeRes = await request(app)
        .patch(`/api/issues/${ISSUE_ID}`)
        .send({ status: "done" });
      expect(completeRes.status).toBe(200);
      expect(completeRes.body.status).toBe("done");

      expect(mockIssueService.checkout).toHaveBeenCalledWith(
        ISSUE_ID,
        AGENT_ID,
        ["todo"],
        null,
      );
      expect(mockIssueService.update).toHaveBeenCalledWith(ISSUE_ID, { status: "done" });
    });
  });
});
