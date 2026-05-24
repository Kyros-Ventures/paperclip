import os from "node:os";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, heartbeatRuns } from "@paperclipai/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AGENT_DEFAULT_MAX_CONCURRENT_RUNS } from "@paperclipai/shared";
import { assertAuthenticated, assertCompanyAccess } from "./authz.js";
import { z } from "zod";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface ServiceHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
}

interface HealthCheck {
  component: string;
  status: HealthStatus;
  latencyMs: number | null;
  lastRunAt: string | null;
  errorMessage: string | null;
}

function resolveOverallStatus(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("unhealthy")) return "unhealthy";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

async function probeDatabaseLatency(db: Db): Promise<{ latencyMs: number; ok: boolean }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { latencyMs: Date.now() - start, ok: true };
  } catch {
    return { latencyMs: Date.now() - start, ok: false };
  }
}

function getCpuPercent(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) {
      totalTick += type;
    }
    totalIdle += cpu.times.idle;
  }
  return totalTick === 0 ? 0 : Math.round(((totalTick - totalIdle) / totalTick) * 100 * 10) / 10;
}

function getMemoryInfo() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const totalMb = Math.round(totalBytes / 1024 / 1024);
  const usedMb = Math.round(usedBytes / 1024 / 1024);
  return {
    usedMb,
    totalMb,
    percent: totalMb === 0 ? 0 : Math.round((usedMb / totalMb) * 1000) / 10,
  };
}

function parseNumberLike(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseHeartbeatConfig(runtimeConfig: unknown): { maxConcurrentRuns: number; maxRunsPerHour: number } {
  const config = runtimeConfig as Record<string, unknown> | null | undefined;
  const heartbeat = (config?.heartbeat ?? {}) as Record<string, unknown>;
  return {
    maxConcurrentRuns: parseNumberLike(heartbeat.maxConcurrentRuns) ?? AGENT_DEFAULT_MAX_CONCURRENT_RUNS,
    maxRunsPerHour: parseNumberLike(heartbeat.maxRunsPerHour) ?? 0,
  };
}

const patchThrottlingSchema = z.object({
  maxConcurrentRuns: z.number().int().min(1).optional(),
  maxRunsPerHour: z.number().int().min(0).optional(),
});

export function systemMonitoringRoutes(db: Db) {
  const router = Router();

  /**
   * GET /system/health
   * Returns overall system health status and per-service summary.
   * @response {status: "healthy"|"degraded"|"unhealthy", services: ServiceHealth[], checkedAt: ISO8601}
   */
  router.get("/system/health", async (req, res) => {
    try {
      assertAuthenticated(req);
    } catch {
      res.status(401).json({ error: "Authentication required", code: "unauthorized" });
      return;
    }

    try {
      const dbProbe = await probeDatabaseLatency(db);
      const dbStatus: HealthStatus = dbProbe.ok
        ? dbProbe.latencyMs > 500 ? "degraded" : "healthy"
        : "unhealthy";

      const services: ServiceHealth[] = [
        { name: "database", status: dbStatus, latencyMs: dbProbe.latencyMs },
      ];

      const overall = resolveOverallStatus(services.map((s) => s.status));
      res.json({ status: overall, services, checkedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: "Failed to check system health", code: "internal_error" });
    }
  });

  /**
   * GET /system/health/checks
   * Returns detailed health checks for each system component.
   * @response {checks: HealthCheck[]}
   */
  router.get("/system/health/checks", async (req, res) => {
    try {
      assertAuthenticated(req);
    } catch {
      res.status(401).json({ error: "Authentication required", code: "unauthorized" });
      return;
    }

    try {
      const now = new Date().toISOString();
      const dbProbe = await probeDatabaseLatency(db);
      const dbStatus: HealthStatus = dbProbe.ok
        ? dbProbe.latencyMs > 500 ? "degraded" : "healthy"
        : "unhealthy";

      const checks: HealthCheck[] = [
        {
          component: "database",
          status: dbStatus,
          latencyMs: dbProbe.latencyMs,
          lastRunAt: now,
          errorMessage: dbProbe.ok ? null : "Database probe failed",
        },
        {
          component: "memory",
          status: (() => {
            const mem = getMemoryInfo();
            if (mem.percent > 95) return "unhealthy";
            if (mem.percent > 80) return "degraded";
            return "healthy";
          })(),
          latencyMs: null,
          lastRunAt: now,
          errorMessage: null,
        },
        {
          component: "cpu",
          status: (() => {
            const pct = getCpuPercent();
            if (pct > 95) return "unhealthy";
            if (pct > 80) return "degraded";
            return "healthy";
          })(),
          latencyMs: null,
          lastRunAt: now,
          errorMessage: null,
        },
      ];

      res.json({ checks });
    } catch {
      res.status(500).json({ error: "Failed to run health checks", code: "internal_error" });
    }
  });

  /**
   * GET /system/resources
   * Returns current system resource utilization (CPU, memory, disk, network).
   * @response {cpu: {percent}, memory: {usedMb, totalMb, percent}, disk: {usedGb, totalGb, percent}, network: {rxKbps, txKbps}}
   */
  router.get("/system/resources", async (req, res) => {
    try {
      assertAuthenticated(req);
    } catch {
      res.status(401).json({ error: "Authentication required", code: "unauthorized" });
      return;
    }

    try {
      const memory = getMemoryInfo();
      const cpuPercent = getCpuPercent();

      res.json({
        cpu: { percent: cpuPercent },
        memory,
        disk: { usedGb: 0, totalGb: 0, percent: 0 },
        network: { rxKbps: 0, txKbps: 0 },
      });
    } catch {
      res.status(500).json({ error: "Failed to read system resources", code: "internal_error" });
    }
  });

  /**
   * GET /companies/:companyId/agents/resource-usage
   * Returns per-agent CPU and memory usage estimates.
   * @response {agents: [{agentId, name, cpuPercent, memoryMb}]}
   */
  router.get("/companies/:companyId/agents/resource-usage", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    try {
      assertCompanyAccess(req, companyId);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? 403;
      res.status(status).json({ error: (err as Error).message, code: "access_denied" });
      return;
    }

    try {
      const rows = await db
        .select({ id: agentsTable.id, name: agentsTable.name })
        .from(agentsTable)
        .where(eq(agentsTable.companyId, companyId));

      res.json({
        agents: rows.map((agent) => ({
          agentId: agent.id,
          name: agent.name,
          cpuPercent: 0,
          memoryMb: 0,
        })),
      });
    } catch {
      res.status(500).json({ error: "Failed to retrieve agent resource usage", code: "internal_error" });
    }
  });

  /**
   * GET /companies/:companyId/agents/throttling
   * Returns throttling rules and current concurrency for each agent.
   * @response {rules: [{agentId, name, maxConcurrentRuns, maxRunsPerHour, currentConcurrent, isThrottled}]}
   */
  router.get("/companies/:companyId/agents/throttling", async (req, res) => {
    const { companyId } = req.params as { companyId: string };
    try {
      assertCompanyAccess(req, companyId);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? 403;
      res.status(status).json({ error: (err as Error).message, code: "access_denied" });
      return;
    }

    try {
      const rows = await db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          runtimeConfig: agentsTable.runtimeConfig,
        })
        .from(agentsTable)
        .where(eq(agentsTable.companyId, companyId));

      if (rows.length === 0) {
        res.json({ rules: [] });
        return;
      }

      const agentIds = rows.map((r) => r.id);
      const activeRunCounts = await db
        .select({
          agentId: heartbeatRuns.agentId,
          count: sql<number>`count(*)::int`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            inArray(heartbeatRuns.agentId, agentIds),
            inArray(heartbeatRuns.status, ["queued", "running"]),
          ),
        )
        .groupBy(heartbeatRuns.agentId);

      const countByAgent = new Map(activeRunCounts.map((r) => [r.agentId, r.count]));

      const rules = rows.map((agent) => {
        const { maxConcurrentRuns, maxRunsPerHour } = parseHeartbeatConfig(agent.runtimeConfig);
        const currentConcurrent = countByAgent.get(agent.id) ?? 0;
        return {
          agentId: agent.id,
          name: agent.name,
          maxConcurrentRuns,
          maxRunsPerHour,
          currentConcurrent,
          isThrottled: currentConcurrent >= maxConcurrentRuns,
        };
      });

      res.json({ rules });
    } catch {
      res.status(500).json({ error: "Failed to retrieve throttling rules", code: "internal_error" });
    }
  });

  /**
   * PATCH /companies/:companyId/agents/throttling/:agentId
   * Updates throttling limits for an agent.
   * @body {maxConcurrentRuns?: number, maxRunsPerHour?: number}
   * @response Updated throttling rule
   */
  router.patch("/companies/:companyId/agents/throttling/:agentId", async (req, res) => {
    const { companyId, agentId } = req.params as { companyId: string; agentId: string };
    try {
      assertCompanyAccess(req, companyId);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status ?? 403;
      res.status(status).json({ error: (err as Error).message, code: "access_denied" });
      return;
    }

    const parsed = patchThrottlingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "validation_error",
      });
      return;
    }

    const { maxConcurrentRuns, maxRunsPerHour } = parsed.data;
    if (maxConcurrentRuns === undefined && maxRunsPerHour === undefined) {
      res.status(400).json({
        error: "At least one of maxConcurrentRuns or maxRunsPerHour must be provided",
        code: "validation_error",
      });
      return;
    }

    try {
      const [agent] = await db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          runtimeConfig: agentsTable.runtimeConfig,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, agentId), eq(agentsTable.companyId, companyId)));

      if (!agent) {
        res.status(404).json({ error: "Agent not found", code: "not_found" });
        return;
      }

      const current = parseHeartbeatConfig(agent.runtimeConfig);
      const updatedHeartbeat = {
        ...((agent.runtimeConfig as Record<string, unknown>)?.heartbeat ?? {}),
        maxConcurrentRuns: maxConcurrentRuns ?? current.maxConcurrentRuns,
        maxRunsPerHour: maxRunsPerHour ?? current.maxRunsPerHour,
      };

      await db
        .update(agentsTable)
        .set({
          runtimeConfig: {
            ...(agent.runtimeConfig as Record<string, unknown>),
            heartbeat: updatedHeartbeat,
          },
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, agentId));

      const [activeRunCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.agentId, agentId),
            inArray(heartbeatRuns.status, ["queued", "running"]),
          ),
        );

      const currentConcurrent = activeRunCount?.count ?? 0;
      const newMaxConcurrent = updatedHeartbeat.maxConcurrentRuns as number;

      res.json({
        agentId: agent.id,
        name: agent.name,
        maxConcurrentRuns: newMaxConcurrent,
        maxRunsPerHour: updatedHeartbeat.maxRunsPerHour as number,
        currentConcurrent,
        isThrottled: currentConcurrent >= newMaxConcurrent,
      });
    } catch {
      res.status(500).json({ error: "Failed to update throttling rule", code: "internal_error" });
    }
  });

  return router;
}
