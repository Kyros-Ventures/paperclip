import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { sprints, sprintStories } from "@paperclipai/db";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";

const createSprintSchema = z.object({
  name: z.string().min(1),
  goal: z.string().optional().nullable(),
  status: z.string().optional().default("planning"),
  velocity: z.number().int().optional().nullable(),
  totalPoints: z.number().int().optional().default(0),
  completedPoints: z.number().int().optional().default(0),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
});

const updateSprintSchema = createSprintSchema.partial();

const addStoryToSprintSchema = z.object({
  storyId: z.string().uuid(),
  addedByAgentId: z.string().uuid().optional().nullable(),
});

export function sprintRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/sprints", async (req: Request, res: Response) => {
    const result = await db.select().from(sprints)
      .where(eq(sprints.companyId, req.params.companyId as string))
      .orderBy(desc(sprints.createdAt));
    res.json({ data: result });
  });

  router.post("/companies/:companyId/sprints", validate(createSprintSchema), async (req: Request, res: Response) => {
    const [sprint] = await db.insert(sprints).values({...req.body, companyId: req.params.companyId as string} as any).returning();
    res.status(201).json(sprint);
  });

  router.get("/sprints/:id", async (req: Request, res: Response) => {
    const result = await db.select().from(sprints).where(eq(sprints.id, req.params.id as string)).limit(1);
    if (!result[0]) throw notFound("Sprint not found");
    const stories = await db.select().from(sprintStories).where(eq(sprintStories.sprintId, req.params.id as string));
    res.json({ ...result[0], sprintStories: stories });
  });

  router.patch("/sprints/:id", validate(updateSprintSchema), async (req: Request, res: Response) => {
    const existing = await db.select().from(sprints).where(eq(sprints.id, req.params.id as string)).limit(1);
    if (!existing[0]) throw notFound("Sprint not found");
    const [updated] = await db.update(sprints).set(req.body as any).where(eq(sprints.id, req.params.id as string)).returning();
    res.json(updated);
  });

  router.delete("/sprints/:id", async (req: Request, res: Response) => {
    await db.delete(sprintStories).where(eq(sprintStories.sprintId, req.params.id as string));
    await db.delete(sprints).where(eq(sprints.id, req.params.id as string));
    res.status(204).send();
  });

  router.post("/sprints/:id/stories", validate(addStoryToSprintSchema), async (req: Request, res: Response) => {
    const existing = await db.select().from(sprints).where(eq(sprints.id, req.params.id as string)).limit(1);
    if (!existing[0]) throw notFound("Sprint not found");
    const [entry] = await db.insert(sprintStories).values({
      sprintId: req.params.id as string,
      storyId: req.body.storyId,
      addedByAgentId: req.body.addedByAgentId ?? null,
    } as any).returning();
    res.status(201).json(entry);
  });

  router.delete("/sprints/:id/stories/:storyId", async (req: Request, res: Response) => {
    await db.delete(sprintStories)
      .where(and(
        eq(sprintStories.sprintId, req.params.id as string),
        eq(sprintStories.storyId, req.params.storyId as string),
      ));
    res.status(204).send();
  });

  return router;
}
