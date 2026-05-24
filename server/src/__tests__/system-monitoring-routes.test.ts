import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { errorHandler } from "../middleware/index.js";
import { systemMonitoringRoutes } from "../routes/system-monitoring.js";

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: {
      ...actual,
      cpus: vi.fn(() => [
        { model: "test", speed: 1000, times: { user: 100, nice: 0, sys: 50, idle: 850, irq: 0 } },
        { model: "test", speed: 1000, times: { user: 80, nice: 0, sys: 40, idle: 880, irq: 0 } },
      ]),
      totalmem: vi.fn(() => 8 * 1024 * 1024 * 1024),
      freemem: vi.fn(() => 4 * 1024 * 1024 * 1024),
    },
  };
});

function makeActor(type: "board" | "agent" | "none" = "board", companyId = "company-1") {
  if (type === "board") {
    return {
      type: "board",
      userId: "user-1",
      companyIds: [companyId],
      source: "local_implicit",
      isInstanceAdmin: true,
    };
  }
  if (type === "agent") {
    return { type: "agent", agentId: "agent-1", companyId, runId: "run-1" };
  }
  return { type: "none" };
}

function createApp(db: Partial<Db>, actorType: "board" | "agent" | "none" = "board") {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { actor: unknown }).actor = makeActor(actorType);
    next();
  });
  app.use("/api", systemMonitoringRoutes(db as Db));
  app.use(errorHandler);
  return app;
}

const mockDb = {
  execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  select: vi.fn(),
  update: vi.fn(),
};

describe("GET /api/system/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns healthy when database probe succeeds quickly", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/health").expect(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.checkedAt).toBeDefined();
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services[0].name).toBe("database");
  });

  it("returns unhealthy when database probe fails", async () => {
    mockDb.execute.mockRejectedValue(new Error("connection refused"));
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/health").expect(200);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.services[0].status).toBe("unhealthy");
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = createApp(mockDb, "none");
    await request(app).get("/api/system/health").expect(401);
  });
});

describe("GET /api/system/health/checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns checks array with component statuses", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/health/checks").expect(200);
    expect(Array.isArray(res.body.checks)).toBe(true);
    const components = res.body.checks.map((c: { component: string }) => c.component);
    expect(components).toContain("database");
    expect(components).toContain("memory");
    expect(components).toContain("cpu");
  });

  it("marks database check as unhealthy when probe fails", async () => {
    mockDb.execute.mockRejectedValue(new Error("db down"));
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/health/checks").expect(200);
    const dbCheck = res.body.checks.find((c: { component: string }) => c.component === "database");
    expect(dbCheck.status).toBe("unhealthy");
    expect(dbCheck.errorMessage).toBeTruthy();
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = createApp(mockDb, "none");
    await request(app).get("/api/system/health/checks").expect(401);
  });

  it("includes lastRunAt timestamp for each check", async () => {
    mockDb.execute.mockResolvedValue([{ "?column?": 1 }]);
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/health/checks").expect(200);
    for (const check of res.body.checks) {
      expect(typeof check.lastRunAt === "string" || check.lastRunAt === null).toBe(true);
    }
  });
});

describe("GET /api/system/resources", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns resource metrics with expected shape", async () => {
    const app = createApp(mockDb);
    const res = await request(app).get("/api/system/resources").expect(200);
    expect(typeof res.body.cpu.percent).toBe("number");
    expect(typeof res.body.memory.usedMb).toBe("number");
    expect(typeof res.body.memory.totalMb).toBe("number");
    expect(typeof res.body.memory.percent).toBe("number");
    expect(typeof res.body.disk.usedGb).toBe("number");
    expect(typeof res.body.disk.totalGb).toBe("number");
    expect(typeof res.body.network.rxKbps).toBe("number");
    expect(typeof res.body.network.txKbps).toBe("number");
  });

  it("returns 401 for unauthenticated requests", async () => {
    const app = createApp(mockDb, "none");
    await request(app).get("/api/system/resources").expect(401);
  });
});

describe("GET /api/companies/:companyId/agents/resource-usage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns agent resource usage list", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { id: "agent-1", name: "Alpha" },
        { id: "agent-2", name: "Beta" },
      ]),
    };
    mockDb.select = vi.fn().mockReturnValue(selectChain);

    const app = createApp(mockDb);
    const res = await request(app).get("/api/companies/company-1/agents/resource-usage").expect(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(res.body.agents[0]).toMatchObject({ agentId: "agent-1", name: "Alpha", cpuPercent: 0, memoryMb: 0 });
  });

  it("returns empty list when no agents exist", async () => {
    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) };
    mockDb.select = vi.fn().mockReturnValue(selectChain);

    const app = createApp(mockDb);
    const res = await request(app).get("/api/companies/company-1/agents/resource-usage").expect(200);
    expect(res.body.agents).toEqual([]);
  });

  it("returns 500 on db error", async () => {
    const selectChain = { from: vi.fn().mockReturnThis(), where: vi.fn().mockRejectedValue(new Error("db error")) };
    mockDb.select = vi.fn().mockReturnValue(selectChain);

    const app = createApp(mockDb);
    await request(app).get("/api/companies/company-1/agents/resource-usage").expect(500);
  });
});

describe("GET /api/companies/:companyId/agents/throttling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns throttling rules with current concurrency", async () => {
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { id: "agent-1", name: "Alpha", runtimeConfig: { heartbeat: { maxConcurrentRuns: 5, maxRunsPerHour: 10 } } },
          ]),
        };
      }
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue([{ agentId: "agent-1", count: 2 }]),
      };
    });

    const app = createApp(mockDb);
    const res = await request(app).get("/api/companies/company-1/agents/throttling").expect(200);
    expect(Array.isArray(res.body.rules)).toBe(true);
    expect(res.body.rules[0]).toMatchObject({
      agentId: "agent-1",
      name: "Alpha",
      maxConcurrentRuns: 5,
      maxRunsPerHour: 10,
      currentConcurrent: 2,
      isThrottled: false,
    });
  });

  it("marks agent as throttled when at concurrency limit", async () => {
    let callCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            { id: "agent-1", name: "Alpha", runtimeConfig: { heartbeat: { maxConcurrentRuns: 2 } } },
          ]),
        };
      }
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue([{ agentId: "agent-1", count: 2 }]),
      };
    });

    const app = createApp(mockDb);
    const res = await request(app).get("/api/companies/company-1/agents/throttling").expect(200);
    expect(res.body.rules[0].isThrottled).toBe(true);
  });

  it("returns empty rules when no agents exist", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });

    const app = createApp(mockDb);
    const res = await request(app).get("/api/companies/company-1/agents/throttling").expect(200);
    expect(res.body.rules).toEqual([]);
  });
});

describe("PATCH /api/companies/:companyId/agents/throttling/:agentId", () => {
  afterEach(() => vi.restoreAllMocks());

  const existingAgent = {
    id: "agent-1",
    name: "Alpha",
    runtimeConfig: { heartbeat: { maxConcurrentRuns: 5, maxRunsPerHour: 10 } },
  };

  function setupMockForPatch(agent: typeof existingAgent | null = existingAgent, activeRuns = 1) {
    let selectCallCount = 0;
    mockDb.select = vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue(agent ? [agent] : []),
        };
      }
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: activeRuns }]),
      };
    });

    mockDb.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });
  }

  it("updates maxConcurrentRuns and returns updated rule", async () => {
    setupMockForPatch();
    const app = createApp(mockDb);
    const res = await request(app)
      .patch("/api/companies/company-1/agents/throttling/agent-1")
      .send({ maxConcurrentRuns: 10 })
      .expect(200);
    expect(res.body.agentId).toBe("agent-1");
    expect(res.body.maxConcurrentRuns).toBe(10);
    expect(typeof res.body.isThrottled).toBe("boolean");
  });

  it("updates maxRunsPerHour and returns updated rule", async () => {
    setupMockForPatch();
    const app = createApp(mockDb);
    const res = await request(app)
      .patch("/api/companies/company-1/agents/throttling/agent-1")
      .send({ maxRunsPerHour: 20 })
      .expect(200);
    expect(res.body.maxRunsPerHour).toBe(20);
  });

  it("returns 400 when no fields provided", async () => {
    const app = createApp(mockDb);
    const res = await request(app)
      .patch("/api/companies/company-1/agents/throttling/agent-1")
      .send({})
      .expect(400);
    expect(res.body.code).toBe("validation_error");
  });

  it("returns 400 when maxConcurrentRuns is less than 1", async () => {
    const app = createApp(mockDb);
    const res = await request(app)
      .patch("/api/companies/company-1/agents/throttling/agent-1")
      .send({ maxConcurrentRuns: 0 })
      .expect(400);
    expect(res.body.code).toBe("validation_error");
  });

  it("returns 404 when agent does not exist", async () => {
    setupMockForPatch(null);
    const app = createApp(mockDb);
    const res = await request(app)
      .patch("/api/companies/company-1/agents/throttling/nonexistent")
      .send({ maxConcurrentRuns: 5 })
      .expect(404);
    expect(res.body.code).toBe("not_found");
  });

  it("returns 500 on db error during update", async () => {
    mockDb.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const app = createApp(mockDb);
    await request(app)
      .patch("/api/companies/company-1/agents/throttling/agent-1")
      .send({ maxConcurrentRuns: 5 })
      .expect(500);
  });
});
