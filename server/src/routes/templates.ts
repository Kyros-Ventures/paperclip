import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { templates } from "@paperclipai/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";

const createTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["issue", "epic", "project"]).default("issue"),
  description: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  variables: z.array(z.string()).optional().default([]),
  projectId: z.string().uuid().optional().nullable(),
});

const updateTemplateSchema = createTemplateSchema.partial();

export function templateRoutes(db: Db) {
  const router = Router();

  // List templates for a company
  router.get("/companies/:companyId/templates", async (req: Request, res: Response) => {
    const result = await db.select().from(templates)
      .where(eq(templates.companyId, req.params.companyId as string))
      .orderBy(desc(templates.createdAt));
    res.json({ data: result });
  });

  // Create template
  router.post("/companies/:companyId/templates", validate(createTemplateSchema), async (req: Request, res: Response) => {
    const [template] = await db.insert(templates).values({
      ...req.body,
      companyId: req.params.companyId as string,
    } as any).returning();
    res.status(201).json(template);
  });

  // Get single template
  router.get("/templates/:id", async (req: Request, res: Response) => {
    const result = await db.select().from(templates)
      .where(eq(templates.id, req.params.id as string))
      .limit(1);
    if (!result[0]) throw notFound("Template not found");
    res.json(result[0]);
  });

  // Update template
  router.patch("/templates/:id", validate(updateTemplateSchema), async (req: Request, res: Response) => {
    const existing = await db.select().from(templates)
      .where(eq(templates.id, req.params.id as string))
      .limit(1);
    if (!existing[0]) throw notFound("Template not found");
    const [updated] = await db.update(templates)
      .set({ ...req.body as any, updatedAt: new Date() })
      .where(eq(templates.id, req.params.id as string))
      .returning();
    res.json(updated);
  });

  // Delete template
  router.delete("/templates/:id", async (req: Request, res: Response) => {
    await db.delete(templates).where(eq(templates.id, req.params.id as string));
    res.status(204).send();
  });

  // Instantiate template — replace variables and create from template
  router.post("/templates/:id/instantiate", async (req: Request, res: Response) => {
    const result = await db.select().from(templates)
      .where(eq(templates.id, req.params.id as string))
      .limit(1);
    if (!result[0]) throw notFound("Template not found");

    const template = result[0];
    let body = template.body ?? "";
    const variableValues = (req.body?.variables ?? {}) as Record<string, string>;

    for (const varName of (template.variables ?? [])) {
      const value = variableValues[varName] ?? "";
      body = body.replace(new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, "g"), value);
    }

    res.json({
      templateId: template.id,
      category: template.category,
      name: template.name,
      body,
    });
  });

  return router;
}
