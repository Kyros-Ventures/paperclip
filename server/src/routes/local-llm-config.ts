import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  putLocalLlmConfigSchema,
  putLocalLlmInferenceSettingsSchema,
  loadLocalLlmModelSchema,
} from "@paperclipai/shared";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertBoardOrgAccess } from "./authz.js";
import { localLlmSettingsService } from "../services/local-llm-settings.js";

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  size_vram: number;
}

interface OllamaPsResponse {
  models: OllamaRunningModel[];
}

async function probeLocalEndpoint(baseUrl: string, timeoutMs = 5000): Promise<{ reachable: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok || resp.status < 500) return { reachable: true };
    return { reachable: false, error: `HTTP ${resp.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { reachable: false, error: msg };
  }
}

export function localLlmConfigRoutes(db: Db) {
  const router = Router();
  const svc = localLlmSettingsService(db);

  // GET /api/llm/config
  router.get("/llm/config", async (req, res) => {
    assertBoardOrgAccess(req);
    res.json(await svc.getConfig());
  });

  // PUT /api/llm/config
  router.put("/llm/config", validate(putLocalLlmConfigSchema), async (req, res) => {
    assertBoardOrgAccess(req);
    res.json(await svc.updateConfig(req.body));
  });

  // POST /api/llm/test-connection
  router.post("/llm/test-connection", async (req, res) => {
    assertBoardOrgAccess(req);
    const config = await svc.getConfig();
    if (!config.baseUrl) {
      throw badRequest("No baseUrl configured. Set it via PUT /api/llm/config first.");
    }
    const result = await probeLocalEndpoint(config.baseUrl);
    res.json({
      reachable: result.reachable,
      baseUrl: config.baseUrl,
      error: result.error ?? null,
      testedAt: new Date().toISOString(),
    });
  });

  // GET /api/llm/models
  router.get("/llm/models", async (req, res) => {
    assertBoardOrgAccess(req);
    const config = await svc.getConfig();
    if (!config.baseUrl) {
      res.json({ models: [], error: "No baseUrl configured" });
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) {
        res.json({ models: [], error: `Upstream error: HTTP ${resp.status}` });
        return;
      }
      const data = (await resp.json()) as OllamaTagsResponse;
      res.json({ models: data.models ?? [] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ models: [], error: msg });
    }
  });

  // POST /api/llm/models/load
  router.post("/llm/models/load", validate(loadLocalLlmModelSchema), async (req, res) => {
    assertBoardOrgAccess(req);
    const config = await svc.getConfig();
    if (!config.baseUrl) {
      throw badRequest("No baseUrl configured. Set it via PUT /api/llm/config first.");
    }
    const { modelName } = req.body as { modelName: string };
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(`${config.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: false }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        res.status(502).json({
          success: false,
          modelName,
          error: `Upstream returned HTTP ${resp.status}: ${body}`,
        });
        return;
      }
      res.json({ success: true, modelName, loadedAt: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ success: false, modelName, error: msg });
    }
  });

  // GET /api/llm/status
  router.get("/llm/status", async (req, res) => {
    assertBoardOrgAccess(req);
    const config = await svc.getConfig();
    if (!config.baseUrl) {
      res.json({
        status: "unconfigured",
        enabled: config.enabled,
        modelName: config.modelName ?? null,
        loadedModels: [],
        error: null,
      });
      return;
    }
    const probe = await probeLocalEndpoint(config.baseUrl);
    if (!probe.reachable) {
      res.json({
        status: "unreachable",
        enabled: config.enabled,
        modelName: config.modelName ?? null,
        loadedModels: [],
        error: probe.error ?? null,
      });
      return;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${config.baseUrl}/api/ps`, { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) {
        res.json({
          status: "reachable",
          enabled: config.enabled,
          modelName: config.modelName ?? null,
          loadedModels: [],
          error: null,
        });
        return;
      }
      const data = (await resp.json()) as OllamaPsResponse;
      const loadedModels = (data.models ?? []).map((m: OllamaRunningModel) => ({
        name: m.name,
        sizeBytes: m.size,
        expiresAt: m.expires_at,
      }));
      const activeModel = loadedModels.find((m) => m.name === config.modelName || m.name.startsWith(config.modelName ?? ""));
      res.json({
        status: activeModel ? "loaded" : "reachable",
        enabled: config.enabled,
        modelName: config.modelName ?? null,
        loadedModels,
        error: null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({
        status: "reachable",
        enabled: config.enabled,
        modelName: config.modelName ?? null,
        loadedModels: [],
        error: msg,
      });
    }
  });

  // GET /api/llm/inference-settings
  router.get("/llm/inference-settings", async (req, res) => {
    assertBoardOrgAccess(req);
    res.json(await svc.getInferenceSettings());
  });

  // PUT /api/llm/inference-settings
  router.put("/llm/inference-settings", validate(putLocalLlmInferenceSettingsSchema), async (req, res) => {
    assertBoardOrgAccess(req);
    res.json(await svc.updateInferenceSettings(req.body));
  });

  return router;
}
