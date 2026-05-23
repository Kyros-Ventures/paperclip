import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { goalRoutes } from "../routes/goals.js";

const mockGoalService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("../services/index.js", () => ({
  goalService: () => mockGoalService,
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

vi.mock("../middleware/validate.js", () => ({
  validate: () => (req: any, _res: any, next: any) => next(),
}));

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
  app.use("/api", goalRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("goal routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("GET /companies/:companyId/goals", () => {
    it("lists goals for a company", async () => {
      mockGoalService.list.mockResolvedValue([
        { id: "g1", title: "Phase 1", companyId: "company-1" },
      ]);
      const app = createApp();
      const res = await request(app)
        .get("/api/companies/company-1/goals")
        .expect(200);

      expect(res.body).toHaveLength(1);
    });
  });

  describe("GET /goals/:id", () => {
    it("returns a goal by id", async () => {
      mockGoalService.getById.mockResolvedValue({
        id: "g1",
        title: "Phase 1",
        companyId: "company-1",
      });
      const app = createApp();
      const res = await request(app).get("/api/goals/g1").expect(200);

      expect(res.body.title).toBe("Phase 1");
    });

    it("returns 404 for missing goal", async () => {
      mockGoalService.getById.mockResolvedValue(null);
      const app = createApp();
      await request(app).get("/api/goals/g99").expect(404);
    });
  });

  describe("POST /companies/:companyId/goals", () => {
    it("creates a goal", async () => {
      mockGoalService.create.mockResolvedValue({
        id: "g1",
        title: "Phase 1",
        companyId: "company-1",
      });
      const app = createApp();
      const res = await request(app)
        .post("/api/companies/company-1/goals")
        .send({ title: "Phase 1", level: "team" })
        .expect(201);

      expect(res.body.title).toBe("Phase 1");
    });
  });

  describe("PATCH /goals/:id", () => {
    it("updates a goal", async () => {
      mockGoalService.getById.mockResolvedValue({
        id: "g1",
        companyId: "company-1",
        title: "Old",
      });
      mockGoalService.update.mockResolvedValue({
        id: "g1",
        title: "Updated",
        companyId: "company-1",
      });
      const app = createApp();
      const res = await request(app)
        .patch("/api/goals/g1")
        .send({ title: "Updated" })
        .expect(200);

      expect(res.body.title).toBe("Updated");
    });
  });

  describe("DELETE /goals/:id", () => {
    it("deletes a goal", async () => {
      mockGoalService.getById.mockResolvedValue({
        id: "g1",
        companyId: "company-1",
      });
      mockGoalService.remove.mockResolvedValue({
        id: "g1",
        title: "Removed",
        companyId: "company-1",
      });
      const app = createApp();
      const res = await request(app).delete("/api/goals/g1").expect(200);

      expect(res.body.title).toBe("Removed");
    });
  });
});
