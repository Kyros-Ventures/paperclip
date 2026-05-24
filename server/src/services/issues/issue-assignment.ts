/**
 * Issue Assignment Module
 * Handles agent assignment, workload balancing, and auto-assignment logic
 */
import { issues, agents } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { eq, and, sql } from "drizzle-orm";

const WEIGHTS = {
  skillMatch: 0.35,
  workload: 0.25,
  performance: 0.20,
  recency: 0.10,
  complexity: 0.10,
};

const CONFIDENCE_THRESHOLD = 0.6;

interface IssueRequest {
  title: string;
  description: string;
  priority: string;
  requiredSkills?: string[];
  complexity?: string;
}

export interface AgentScore {
  agentId: string;
  agentName: string;
  totalScore: number;
  breakdown: {
    skillMatch: number;
    workload: number;
    performance: number;
    recency: number;
    complexity: number;
  };
  confidence: "high" | "medium" | "low";
}

export interface AutoAssignResult {
  success: boolean;
  message: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  score?: number;
  alternativeAgents?: AgentScore[];
}

export interface WorkloadAnalytics {
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  overloadedAgents: number;
  averageUtilization: number;
  issuesByAgent: Record<string, number>;
  recommendations: string[];
}

export async function findBestAgent(
  db: Db,
  issue: IssueRequest,
  companyId: string,
  excludeAgentIds: string[] = [],
): Promise<AgentScore | null> {
  const companyAgents = await db.query.agents.findMany({
    where: and(eq(agents.companyId, companyId), eq(agents.status, "active")),
  });
  if (companyAgents.length === 0) return null;

  const eligibleAgents = companyAgents.filter((a) => !excludeAgentIds.includes(a.id));
  if (eligibleAgents.length === 0) return null;

  const scoredAgents = await Promise.all(
    eligibleAgents.map((agent) => calculateAgentScore(db, agent, issue)),
  );
  scoredAgents.sort((a, b) => b.totalScore - a.totalScore);
  return scoredAgents[0] ?? null;
}

export async function calculateAgentScore(
  db: Db,
  agent: { id: string; name: string; skills?: string[] | null },
  issue: IssueRequest,
): Promise<AgentScore> {
  const workload = await getAgentWorkload(db, agent.id);
  const performance = await getAgentPerformance(db, agent.id);

  const agentSkills = agent.skills ?? [];
  const requiredSkills = issue.requiredSkills ?? [];
  const skillMatch = calculateSkillMatch(agentSkills, requiredSkills, issue.title);

  const workloadUtilization = workload.currentIssues / Math.max(workload.maxIssues, 1);
  const workloadScore = Math.max(0, 1 - workloadUtilization);

  const hoursSinceActive = workload.hoursSinceLastActive || 24;
  const recencyScore = Math.min(1, 24 / Math.max(hoursSinceActive, 1));

  const complexityScore = calculateComplexityMatch(agentSkills, issue.complexity);

  const totalScore =
    skillMatch * WEIGHTS.skillMatch +
    workloadScore * WEIGHTS.workload +
    performance.score * WEIGHTS.performance +
    recencyScore * WEIGHTS.recency +
    complexityScore * WEIGHTS.complexity;

  let confidence: AgentScore["confidence"] = "low";
  if (totalScore >= 0.8) confidence = "high";
  else if (totalScore >= CONFIDENCE_THRESHOLD) confidence = "medium";

  return {
    agentId: agent.id,
    agentName: agent.name,
    totalScore: Math.round(totalScore * 100) / 100,
    breakdown: {
      skillMatch: Math.round(skillMatch * 100) / 100,
      workload: Math.round(workloadScore * 100) / 100,
      performance: Math.round(performance.score * 100) / 100,
      recency: Math.round(recencyScore * 100) / 100,
      complexity: Math.round(complexityScore * 100) / 100,
    },
    confidence,
  };
}

export async function autoAssign(
  db: Db,
  issueId: string,
  companyId: string,
): Promise<AutoAssignResult> {
  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.id, issueId), eq(issues.companyId, companyId)),
  });
  if (!issue) return { success: false, message: "Issue not found" };
  if (issue.assigneeAgentId) return { success: false, message: "Issue already assigned" };

  const bestAgent = await findBestAgent(
    db,
    { title: issue.title, description: issue.description ?? "", priority: issue.priority ?? "medium" },
    companyId,
  );
  if (!bestAgent) return { success: false, message: "No suitable agent found" };

  if (bestAgent.confidence === "low") {
    const alternatives = await getTopAgents(
      db,
      { title: issue.title, description: issue.description ?? "", priority: issue.priority ?? "medium" },
      companyId,
      3,
    );
    return {
      success: false,
      message: "Low confidence in auto-assignment. Manual selection recommended.",
      alternativeAgents: alternatives,
    };
  }

  await db
    .update(issues)
    .set({ assigneeAgentId: bestAgent.agentId, status: "in_progress", updatedAt: new Date() })
    .where(eq(issues.id, issueId));

  console.log(`[Assignment] Issue ${issueId} assigned to ${bestAgent.agentId} (score: ${bestAgent.totalScore})`);

  return {
    success: true,
    assignedAgentId: bestAgent.agentId,
    assignedAgentName: bestAgent.agentName,
    score: bestAgent.totalScore,
    message: `Assigned to ${bestAgent.agentName} with ${Math.round(bestAgent.totalScore * 100)}% confidence`,
  };
}

export async function getAssignmentAnalytics(db: Db, companyId: string): Promise<WorkloadAnalytics> {
  const companyAgents = await db.query.agents.findMany({
    where: eq(agents.companyId, companyId),
  });

  const agentIssues: Record<string, number> = {};
  let availableCount = 0;
  let busyCount = 0;
  let overloadedCount = 0;
  let totalUtilization = 0;

  for (const agent of companyAgents) {
    const workload = await getAgentWorkload(db, agent.id);
    agentIssues[agent.id] = workload.currentIssues;
    const utilization = workload.currentIssues / Math.max(workload.maxIssues, 1);
    totalUtilization += utilization;
    if (utilization < 0.5) availableCount++;
    else if (utilization < 0.8) busyCount++;
    else overloadedCount++;
  }

  const avgUtilization = companyAgents.length > 0 ? totalUtilization / companyAgents.length : 0;

  const recommendations: string[] = [];
  if (overloadedCount > 0)
    recommendations.push(`${overloadedCount} agents are overloaded. Consider redistributing work.`);
  if (availableCount > busyCount + overloadedCount)
    recommendations.push("Good capacity available for new issues.");
  if (avgUtilization > 0.8)
    recommendations.push("Company is at high utilization. Consider adding agents.");

  return {
    totalAgents: companyAgents.length,
    availableAgents: availableCount,
    busyAgents: busyCount,
    overloadedAgents: overloadedCount,
    averageUtilization: Math.round(avgUtilization * 100),
    issuesByAgent: agentIssues,
    recommendations,
  };
}

async function getAgentWorkload(db: Db, agentId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(issues)
    .where(and(eq(issues.assigneeAgentId, agentId), eq(issues.status, "in_progress")));

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
    columns: { lastHeartbeatAt: true },
  });

  const hoursSinceLastActive = agent?.lastHeartbeatAt
    ? (Date.now() - agent.lastHeartbeatAt.getTime()) / (1000 * 60 * 60)
    : 24;

  return {
    currentIssues: Number(rows[0]?.count ?? 0),
    maxIssues: 5,
    hoursSinceLastActive,
  };
}

async function getAgentPerformance(db: Db, agentId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(issues)
    .where(
      and(
        eq(issues.assigneeAgentId, agentId),
        eq(issues.status, "done"),
        sql`${issues.updatedAt} > ${thirtyDaysAgo}`,
      ),
    );

  const completed = Number(rows[0]?.count ?? 0);
  return { completedIssues: completed, score: Math.round(Math.min(1, completed / 10) * 100) / 100 };
}

function calculateSkillMatch(agentSkills: string[], requiredSkills: string[], title: string): number {
  let skills = requiredSkills;
  if (skills.length === 0) {
    const keywords = ["frontend", "backend", "database", "api", "ui", "testing", "devops", "security"];
    const lower = title.toLowerCase();
    skills = keywords.filter((k) => lower.includes(k));
  }
  if (skills.length === 0) return 0.5;
  const matches = skills.filter((s) =>
    agentSkills.some((as) => as.toLowerCase().includes(s.toLowerCase())),
  ).length;
  return matches / skills.length;
}

function calculateComplexityMatch(agentSkills: string[], complexity?: string): number {
  if (!complexity) return 0.5;
  const n = agentSkills.length;
  if (complexity === "low") return n >= 1 ? 1 : 0.7;
  if (complexity === "medium") return n >= 3 ? 1 : n >= 2 ? 0.8 : 0.5;
  return n >= 5 ? 1 : n >= 3 ? 0.8 : 0.4;
}

async function getTopAgents(
  db: Db,
  issue: IssueRequest,
  companyId: string,
  limit: number,
): Promise<AgentScore[]> {
  const companyAgents = await db.query.agents.findMany({
    where: and(eq(agents.companyId, companyId), eq(agents.status, "active")),
  });
  const scored = await Promise.all(companyAgents.map((a) => calculateAgentScore(db, a, issue)));
  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.slice(0, limit);
}
