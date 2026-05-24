import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLocalLlmSettingsService = vi.hoisted(() => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  getInferenceSettings: vi.fn(),
  updateInferenceSettings: vi.fn(),
}));

function registerModuleMocks() {
  vi.doMock("../services/local-llm-settings.js", () => ({
    localLlmSettingsService: () => mockLocalLlmSettingsService,
  }));
}

const boardActor = {
  type: "board",
  source: "local_implicit",
  isInstanceAdmin: true,
  companyIds: ["company-1"],
  memberships: [],
};

const noActor = { type: "none" };

async function createApp(actor: unknown) {
  const [{ errorHandler }, { localLlmConfigRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/local-llm-config.js")>("../routes/local-llm-config.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.actor = actor as any;
    next();
  });
  app.use("/api", localLlmConfigRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const DEFAULT_CONFIG = {
  baseUrl: undefined,
  modelPath: undefined,
  modelName: undefined,
  quantization: "none",
  contextLength: 4096,
  enabled: false,
};

const DEFAULT_INFERENCE = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxTokens: 2048,
  repeatPenalty: 1.1,
  seed: undefined,
};

describe("local LLM config routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/local-llm-settings.js");
    vi.doUnmock("../routes/local-llm-config.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockLocalLlmSettingsService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockLocalLlmSettingsService.updateConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockLocalLlmSettingsService.getInferenceSettings.mockResolvedValue(DEFAULT_INFERENCE);
    mockLocalLlmSettingsService.updateInferenceSettings.mockResolvedValue(DEFAULT_INFERENCE);
  });

  describe("GET /api/llm/config", () => {
    it("returns config for board actor", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/config");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULT_CONFIG);
    });

    it("returns 403 for unauthenticated actor", async () => {
      const app = await createApp(noActor);
      const res = await request(app).get("/api/llm/config");
      expect(res.status).toBe(403);
    });
  });

  describe("PUT /api/llm/config", () => {
    it("updates config with valid fields", async () => {
      const update = { baseUrl: "http://localhost:11434", modelName: "qwen2.5:14b", enabled: true };
      mockLocalLlmSettingsService.updateConfig.mockResolvedValue({ ...DEFAULT_CONFIG, ...update });
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/config").send(update);
      expect(res.status).toBe(200);
      expect(mockLocalLlmSettingsService.updateConfig).toHaveBeenCalledWith(update);
    });

    it("rejects invalid baseUrl", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/config").send({ baseUrl: "not-a-url" });
      expect(res.status).toBe(400);
    });

    it("rejects unknown fields (strict schema)", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/config").send({ unknownField: true });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/llm/test-connection", () => {
    it("returns error when no baseUrl configured", async () => {
      mockLocalLlmSettingsService.getConfig.mockResolvedValue(DEFAULT_CONFIG);
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/test-connection");
      expect(res.status).toBe(400);
    });

    it("probes endpoint when baseUrl is set", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);
      mockLocalLlmSettingsService.getConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        baseUrl: "http://localhost:11434",
      });
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/test-connection");
      expect(res.status).toBe(200);
      expect(res.body.reachable).toBe(true);
      expect(res.body.baseUrl).toBe("http://localhost:11434");
      fetchMock.mockRestore();
    });

    it("reports unreachable when fetch throws", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      mockLocalLlmSettingsService.getConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        baseUrl: "http://localhost:11434",
      });
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/test-connection");
      expect(res.status).toBe(200);
      expect(res.body.reachable).toBe(false);
      expect(res.body.error).toBe("ECONNREFUSED");
      fetchMock.mockRestore();
    });
  });

  describe("GET /api/llm/models", () => {
    it("returns empty list when no baseUrl configured", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/models");
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual([]);
    });

    it("fetches models from Ollama endpoint", async () => {
      const models = [{ name: "qwen2.5:14b", size: 8e9 }];
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ models }),
      } as Response);
      mockLocalLlmSettingsService.getConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        baseUrl: "http://localhost:11434",
      });
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/models");
      expect(res.status).toBe(200);
      expect(res.body.models).toEqual(models);
      fetchMock.mockRestore();
    });
  });

  describe("POST /api/llm/models/load", () => {
    it("requires modelName field", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/models/load").send({});
      expect(res.status).toBe(400);
    });

    it("returns 400 when no baseUrl configured", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/models/load").send({ modelName: "qwen2.5:14b" });
      expect(res.status).toBe(400);
    });

    it("loads model via Ollama pull", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success" }),
      } as Response);
      mockLocalLlmSettingsService.getConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        baseUrl: "http://localhost:11434",
      });
      const app = await createApp(boardActor);
      const res = await request(app).post("/api/llm/models/load").send({ modelName: "qwen2.5:14b" });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.modelName).toBe("qwen2.5:14b");
      fetchMock.mockRestore();
    });
  });

  describe("GET /api/llm/status", () => {
    it("returns unconfigured status when no baseUrl", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/status");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("unconfigured");
    });

    it("returns unreachable when endpoint is down", async () => {
      const fetchMock = vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
      mockLocalLlmSettingsService.getConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        baseUrl: "http://localhost:11434",
        modelName: "qwen2.5:14b",
      });
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/status");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("unreachable");
      fetchMock.mockRestore();
    });
  });

  describe("GET /api/llm/inference-settings", () => {
    it("returns inference settings", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).get("/api/llm/inference-settings");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(DEFAULT_INFERENCE);
    });
  });

  describe("PUT /api/llm/inference-settings", () => {
    it("updates temperature", async () => {
      mockLocalLlmSettingsService.updateInferenceSettings.mockResolvedValue({
        ...DEFAULT_INFERENCE,
        temperature: 0.3,
      });
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/inference-settings").send({ temperature: 0.3 });
      expect(res.status).toBe(200);
      expect(res.body.temperature).toBe(0.3);
    });

    it("rejects temperature out of range", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/inference-settings").send({ temperature: 5 });
      expect(res.status).toBe(400);
    });

    it("rejects unknown fields (strict schema)", async () => {
      const app = await createApp(boardActor);
      const res = await request(app).put("/api/llm/inference-settings").send({ unknownParam: 1 });
      expect(res.status).toBe(400);
    });
  });
});
