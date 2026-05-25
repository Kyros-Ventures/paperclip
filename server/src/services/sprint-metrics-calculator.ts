/**
 * Sprint Metrics Calculator Service
 *
 * Runs periodically to calculate sprint burndown metrics, velocity tracking,
 * and cycle time tracking. Posts results as issue comments.
 */

import { and, eq, gte, lte, or, desc, sql, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  sprints,
  sprintStories,
  stories,
  issues,
  issueComments,
  agents,
  companies,
} from "@paperclipai/db";
import { issueService } from "./issues.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SprintBurndownMetrics {
  sprintId: string;
  sprintName: string;
  sprintStatus: string;
  totalStories: number;
  totalPoints: number;
  completedStories: number;
  completedPoints: number;
  remainingPoints: number;
  completionPercent: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  velocity: number; // points per day
  onTrack: boolean;
}

export interface CycleTimeRecord {
  issueId: string;
  issueTitle: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cycleTimeHours: number;
  assigneeAgentId: string | null;
}

export interface SprintVelocityRecord {
  sprintId: string;
  sprintName: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  totalPoints: number;
  completedPoints: number;
  velocity: number; // completed points for the whole sprint
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateCycleTimeHours(startedAt: Date | null, completedAt: Date): number {
  if (!startedAt) return 0;
  const diffMs = completedAt.getTime() - startedAt.getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Markdown formatting helpers
// ---------------------------------------------------------------------------

function formatBurndownTable(metrics: SprintBurndownMetrics): string {
  const statusEmoji = metrics.sprintStatus === "active" ? "🏃" :
    metrics.sprintStatus === "completed" ? "✅" : "📋";

  const trackEmoji = metrics.onTrack ? "🟢" : "🔴";

  return `## Sprint Burndown Report ${statusEmoji}

**Sprint:** ${metrics.sprintName}
**Status:** ${metrics.sprintStatus}
**Generated:** ${new Date().toISOString()}

### Burndown Summary

| Metric | Value |
|--------|-------|
| Total Stories | ${metrics.totalStories} |
| Total Points | ${metrics.totalPoints} |
| Completed Stories | ${metrics.completedStories} |
| Completed Points | ${metrics.completedPoints} |
| Remaining Points | ${metrics.remainingPoints} |
| Completion | ${metrics.completionPercent.toFixed(1)}% |
| Days Elapsed | ${metrics.daysElapsed} / ${metrics.daysTotal} |
| Days Remaining | ${metrics.daysRemaining} |
| Velocity (pts/day) | ${metrics.velocity.toFixed(2)} |
| On Track | ${trackEmoji} ${metrics.onTrack ? "Yes" : "No"} |

### Burndown Chart

\`\`\`
${renderAsciiBurndown(metrics)}
\`\`\`

### Velocity by Sprint

Table can be viewed via \`GET /api/metrics/sprint-velocity?companyId=<id>\`
`;
}

function renderAsciiBurndown(metrics: SprintBurndownMetrics): string {
  const totalDays = metrics.daysTotal || 1;
  const totalPts = metrics.totalPoints || 1;

  const lines: string[] = [];
  for (let row = 10; row >= 0; row--) {
    const pointsAtRow = (totalPts / 10) * row;
    const label = row % 2 === 0 ? `${Math.round(pointsAtRow)}`.padStart(4) : "    ";
    let line = label + " |";

    for (let day = 0; day <= totalDays; day++) {
      const idealRemaining = totalPts * (1 - day / totalDays);
      const actualRemaining = metrics.totalPoints - (metrics.completedPoints * (day / Math.max(1, metrics.daysElapsed)));

      if (idealRemaining >= pointsAtRow) {
        line += "·"; // Above the line
      } else if (day <= metrics.daysElapsed) {
        line += "▓"; // Actual burned area
      } else {
        line += "░"; // Future ideal
      }
    }
    lines.push(line);
  }

  // Day axis
  lines.push("     +" + "─".repeat(Math.max(totalDays + 1, 10)));
  return lines.join("\n");
}

function formatCycleTimeComment(record: CycleTimeRecord): string {
  const hours = record.cycleTimeHours;
  const days = (hours / 24).toFixed(1);
  let assessment: string;

  if (hours <= 4) assessment = "⚡ Lightning fast!";
  else if (hours <= 24) assessment = "✅ Great pace (under a day)";
  else if (hours <= 72) assessment = "📊 Average pace";
  else if (hours <= 168) assessment = "🐢 Slower than ideal";
  else assessment = "⚠️ Needs attention";

  return `## Cycle Time Report ⏱️

**Issue:** ${record.issueTitle}
**Started:** ${record.startedAt?.toISOString() ?? "N/A"}
**Completed:** ${record.completedAt?.toISOString() ?? "N/A"}
**Cycle Time:** ${hours.toFixed(2)} hours (${days} days)

**Assessment:** ${assessment}
`;
}

// ---------------------------------------------------------------------------
// Core service
// ---------------------------------------------------------------------------

export function sprintMetricsCalculator(db: Db) {
  const svc = issueService(db);

  return {
    /**
     * Calculate sprint burndown metrics for a given sprint
     */
    calculateSprintBurndown: async (sprintId: string): Promise<SprintBurndownMetrics | null> => {
      const sprint = await db
        .select()
        .from(sprints)
        .where(eq(sprints.id, sprintId))
        .then((rows) => rows[0] ?? null);

      if (!sprint) return null;

      // Get stories in sprint
      const sprintStoryList = await db
        .select({ issueId: sprintStories.issueId })
        .from(sprintStories)
        .where(eq(sprintStories.sprintId, sprintId));

      const storyIds = sprintStoryList.map((s) => s.issueId).filter((id): id is string => id !== null);

      let totalStories = 0;
      let totalPoints = 0;
      let completedStories = 0;
      let completedPoints = 0;

      if (storyIds.length > 0) {
        const storyList = await db
          .select({
            id: stories.id,
            points: stories.storyPoints,
            status: stories.status,
          })
          .from(stories)
          .where(inArray(stories.id, storyIds));

        totalStories = storyList.length;
        totalPoints = storyList.reduce((sum, s) => sum + (s.points || 0), 0);
        completedStories = storyList.filter((s) => s.status === "done").length;
        completedPoints = storyList
          .filter((s) => s.status === "done")
          .reduce((sum, s) => sum + (s.points || 0), 0);
      }

      // Also count issues directly assigned to sprint (via company/project scope)
      // We use stories as the primary unit

      const now = new Date();
      const daysElapsed = sprint.startDate
        ? Math.max(0, daysBetween(sprint.startDate, now))
        : 0;
      const daysTotal = sprint.startDate && sprint.endDate
        ? daysBetween(sprint.startDate, sprint.endDate)
        : 14;

      const daysRemaining = Math.max(0, daysTotal - daysElapsed);
      const velocity = daysElapsed > 0 ? completedPoints / daysElapsed : 0;
      const completionPercent = totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0;
      const remainingPoints = totalPoints - completedPoints;

      const idealCompletedByNow = (daysElapsed / Math.max(1, daysTotal)) * totalPoints;
      const onTrack = completedPoints >= idealCompletedByNow;

      return {
        sprintId,
        sprintName: sprint.name,
        sprintStatus: sprint.status,
        totalStories,
        totalPoints,
        completedStories,
        completedPoints,
        remainingPoints,
        completionPercent,
        daysElapsed,
        daysTotal,
        daysRemaining,
        velocity,
        onTrack,
      };
    },

    /**
     * Calculate burndown for all active sprints in a company
     */
    calculateActiveSprintsBurndown: async (companyId: string): Promise<SprintBurndownMetrics[]> => {
      const activeSprints = await db
        .select({ id: sprints.id })
        .from(sprints)
        .where(
          and(
            eq(sprints.companyId, companyId),
            eq(sprints.status, "active"),
          ),
        );

      const results: SprintBurndownMetrics[] = [];
      for (const s of activeSprints) {
        const metrics = await sprintMetricsCalculator(db).calculateSprintBurndown(s.id);
        if (metrics) results.push(metrics);
      }
      return results;
    },

    /**
     * Get velocity records for all sprints in a company
     */
    getSprintVelocityRecords: async (companyId: string): Promise<SprintVelocityRecord[]> => {
      const allSprints = await db
        .select()
        .from(sprints)
        .where(eq(sprints.companyId, companyId))
        .orderBy(desc(sprints.createdAt));

      const records: SprintVelocityRecord[] = [];

      for (const sprint of allSprints) {
        const sprintStoryList = await db
          .select({ issueId: sprintStories.issueId })
          .from(sprintStories)
          .where(eq(sprintStories.sprintId, sprint.id));

        const storyIds = sprintStoryList.map((s) => s.issueId).filter((id): id is string => id !== null);
        let totalPoints = 0;
        let completedPoints = 0;

        if (storyIds.length > 0) {
          const storyList = await db
            .select({
              id: stories.id,
              points: stories.storyPoints,
              status: stories.status,
            })
            .from(stories)
            .where(inArray(stories.id, storyIds));

          totalPoints = storyList.reduce((sum, s) => sum + (s.points || 0), 0);
          completedPoints = storyList
            .filter((s) => s.status === "done")
            .reduce((sum, s) => sum + (s.points || 0), 0);
        }

        records.push({
          sprintId: sprint.id,
          sprintName: sprint.name,
          startDate: sprint.startDate ?? null,
          endDate: sprint.endDate ?? null,
          status: sprint.status,
          totalPoints,
          completedPoints,
          velocity: completedPoints,
        });
      }

      return records;
    },

    /**
     * Find recently completed issues that haven't had cycle time posted
     * and compute their cycle time
     */
    getRecentCycleTimes: async (
      companyId: string,
      sinceMinutes: number = 60,
    ): Promise<CycleTimeRecord[]> => {
      const since = new Date(Date.now() - sinceMinutes * 60 * 1000);

      const completedIssues = await db
        .select({
          id: issues.id,
          title: issues.title,
          startedAt: issues.startedAt,
          completedAt: issues.completedAt,
          assigneeAgentId: issues.assigneeAgentId,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            isNotNull(issues.completedAt),
            gte(issues.completedAt, since),
          ),
        );

      return completedIssues.map((issue) => ({
        issueId: issue.id,
        issueTitle: issue.title,
        startedAt: issue.startedAt,
        completedAt: issue.completedAt,
        cycleTimeHours: calculateCycleTimeHours(issue.startedAt, issue.completedAt!),
        assigneeAgentId: issue.assigneeAgentId,
      }));
    },

    /**
     * Post a comment on an issue. Uses a synthetic "system" actor.
     */
    postComment: async (
      issueId: string,
      body: string,
    ): Promise<void> => {
      try {
        await svc.addComment(issueId, body, { agentId: undefined, userId: undefined });
      } catch (err) {
        console.warn(`[SprintMetrics] Failed to post comment on issue ${issueId}:`, err);
      }
    },

    /**
     * Post burndown report as a comment on the active sprint's story.
     * Falls back to logging if no story issue exists.
     */
    postBurndownComment: async (
      companyId: string,
      sprintId: string,
      metrics: SprintBurndownMetrics,
    ): Promise<void> => {
      const formatted = formatBurndownTable(metrics);

      // Try to find a suitable issue to comment on (e.g., the sprint goal)
      // For now, we'll look for any story in the sprint that has an associated issue
      const sprintStoryList = await db
        .select({ issueId: sprintStories.issueId })
        .from(sprintStories)
        .where(eq(sprintStories.sprintId, sprintId));

      if (sprintStoryList.length > 0) {
        // Post on the first story - in practice you'd want to post on the sprint goal
        const storyId = sprintStoryList[0]!.issueId;
        if (!storyId) return;
        try {
          await sprintMetricsCalculator(db).postComment(storyId, formatted);
          console.log(`[SprintMetrics] Posted burndown report for sprint ${sprintId}`);
        } catch {
          console.log(`[SprintMetrics] Burndown report for sprint ${metrics.sprintName}:`);
          console.log(formatted);
        }
      } else {
        console.log(`[SprintMetrics] No stories in sprint ${sprintId} to post report.`);
      }
    },

    /**
     * Post cycle time comment on an issue
     */
    postCycleTimeComment: async (
      record: CycleTimeRecord,
    ): Promise<void> => {
      const formatted = formatCycleTimeComment(record);
      await sprintMetricsCalculator(db).postComment(record.issueId, formatted);
      console.log(`[SprintMetrics] Posted cycle time for issue ${record.issueId}: ${record.cycleTimeHours.toFixed(2)}h`);
    },

    /**
     * Full tick: calculate burndown for all active sprints,
     * post cycle times for recently completed issues.
     */
    tick: async (companyId: string): Promise<{
      burndownsPosted: number;
      cycleTimesPosted: number;
    }> => {
      console.log(`[SprintMetrics] Starting tick for company ${companyId}`);

      let burndownsPosted = 0;
      let cycleTimesPosted = 0;

      // 1. Calculate burndown for active sprints
      try {
        const activeBurndowns = await sprintMetricsCalculator(db).calculateActiveSprintsBurndown(companyId);
        for (const metrics of activeBurndowns) {
          await sprintMetricsCalculator(db).postBurndownComment(companyId, metrics.sprintId, metrics);
          burndownsPosted++;
        }
      } catch (err) {
        console.error(`[SprintMetrics] Burndown calculation failed for company ${companyId}:`, err);
      }

      // 2. Post cycle times for recently completed issues
      try {
        const recentCycleTimes = await sprintMetricsCalculator(db).getRecentCycleTimes(companyId, 60);
        for (const record of recentCycleTimes) {
          await sprintMetricsCalculator(db).postCycleTimeComment(record);
          cycleTimesPosted++;
        }
      } catch (err) {
        console.error(`[SprintMetrics] Cycle time posting failed for company ${companyId}:`, err);
      }

      console.log(`[SprintMetrics] Tick complete for company ${companyId}: ${burndownsPosted} burndowns, ${cycleTimesPosted} cycle times`);
      return { burndownsPosted, cycleTimesPosted };
    },

    /**
     * Run a tick across ALL companies (for the periodic cron worker)
     */
    tickAllCompanies: async (): Promise<{
      companiesProcessed: number;
      burndownsPosted: number;
      cycleTimesPosted: number;
    }> => {
      const allCompanies = await db
        .select({ id: companies.id })
        .from(companies);

      let burndownsPosted = 0;
      let cycleTimesPosted = 0;

      for (const company of allCompanies) {
        try {
          const result = await sprintMetricsCalculator(db).tick(company.id);
          burndownsPosted += result.burndownsPosted;
          cycleTimesPosted += result.cycleTimesPosted;
        } catch (err) {
          console.error(`[SprintMetrics] Tick failed for company ${company.id}:`, err);
        }
      }

      console.log(
        `[SprintMetrics] All-companies tick complete: ` +
        `${allCompanies.length} companies, ${burndownsPosted} burndowns, ${cycleTimesPosted} cycle times`,
      );

      return {
        companiesProcessed: allCompanies.length,
        burndownsPosted,
        cycleTimesPosted,
      };
    },
  };
}
