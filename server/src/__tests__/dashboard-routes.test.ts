import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { dashboardRoutes } from "../routes/dashboard.js";

const mockDashboardService = vi.hoisted(() => ({
  summary: vi.fn(),
}));

vi.mock("../services/dashboard.js", () => ({
  dashboardService: () => mockDashboardService,
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
  app.use("/api", dashboardRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("dashboard routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns dashboard summary", async () => {
    mockDashboardService.summary.mockResolvedValue({
      totalIssues: 42,
      activeAgents: 5,
      monthlySpendCents: 1500,
    });
    const app = createApp();
    const res = await request(app)
      .get("/api/companies/company-1/dashboard")
      .expect(200);

    expect(res.body).toEqual({
      totalIssues: 42,
      activeAgents: 5,
      monthlySpendCents: 1500,
    });
  });
});
