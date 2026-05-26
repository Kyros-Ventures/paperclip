import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { deploymentRoutes } from "../routes/deployment.js";

const mockDeploymentService = vi.hoisted(() => ({
  deployToStaging: vi.fn(),
  requestProductionApproval: vi.fn(),
  deployToProduction: vi.fn(),
  rollback: vi.fn(),
  getDeployment: vi.fn(),
  listDeployments: vi.fn(),
}));

vi.mock("../services/deploymentService.js", () => ({ deploymentService: mockDeploymentService }));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", deploymentRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("deployment routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("POST /companies/:companyId/deployments/staging", () => {
    it("deploys to staging", async () => {
      mockDeploymentService.deployToStaging.mockResolvedValue({
        id: "deploy-1",
        status: "deploying",
      });
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/deployments/staging")
        .send({ repo: "my-repo", branch: "feature/x" })
        .expect(200);

      expect(res.body).toEqual({ id: "deploy-1", status: "deploying" });
      expect(mockDeploymentService.deployToStaging).toHaveBeenCalledWith(
        "my-repo",
        "feature/x",
      );
    });

    it("returns 500 on service error", async () => {
      mockDeploymentService.deployToStaging.mockRejectedValue(
        new Error("boom"),
      );
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/deployments/staging")
        .send({ repo: "my-repo" })
        .expect(500);

      expect(res.body.error).toContain("boom");
    });
  });

  describe("POST /companies/:companyId/deployments/:deployId/approve", () => {
    it("requests production approval", async () => {
      mockDeploymentService.requestProductionApproval.mockResolvedValue({
        approved: true,
      });
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/deployments/deploy-1/approve")
        .send({ requestedBy: "user-1" })
        .expect(200);

      expect(res.body).toEqual({ approved: true });
    });
  });

  describe("POST /companies/:companyId/deployments/production", () => {
    it("deploys to production", async () => {
      mockDeploymentService.deployToProduction.mockResolvedValue({
        id: "deploy-2",
        status: "live",
      });
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/deployments/production")
        .send({ repo: "my-repo", stagingDeployId: "deploy-1", approver: "admin" })
        .expect(200);

      expect(res.body).toEqual({ id: "deploy-2", status: "live" });
    });
  });

  describe("POST /companies/:companyId/deployments/:deployId/rollback", () => {
    it("rolls back a deployment", async () => {
      mockDeploymentService.rollback.mockResolvedValue(undefined);
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/deployments/deploy-1/rollback")
        .expect(200);

      expect(res.body).toEqual({ success: true });
    });
  });

  describe("GET /companies/:companyId/deployments/:deployId", () => {
    it("returns a deployment by id", async () => {
      mockDeploymentService.getDeployment.mockReturnValue({
        id: "deploy-1",
        status: "live",
      });
      const app = createApp();
      const res = await request(app)
        .get("/api/companies/company-1/deployments/deploy-1")
        .expect(200);

      expect(res.body).toEqual({ id: "deploy-1", status: "live" });
    });

    it("returns 404 for missing deployment", async () => {
      mockDeploymentService.getDeployment.mockReturnValue(undefined);
      const app = createApp();
      await request(app)
        .get("/api/companies/company-1/deployments/deploy-99")
        .expect(404);
    });
  });

  describe("GET /companies/:companyId/deployments", () => {
    it("lists deployments", async () => {
      mockDeploymentService.listDeployments.mockReturnValue([
        { id: "deploy-1" },
        { id: "deploy-2" },
      ]);
      const app = createApp();
      const res = await request(app)
        .get("/api/companies/company-1/deployments?repo=my-repo")
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(mockDeploymentService.listDeployments).toHaveBeenCalledWith(
        "my-repo",
      );
    });

    it("lists all deployments when no repo filter", async () => {
      mockDeploymentService.listDeployments.mockReturnValue([]);
      const app = createApp();
      const res = await request(app)
        .get("/api/companies/company-1/deployments")
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
