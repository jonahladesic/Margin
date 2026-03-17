import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  timeBlocksTable,
  usersTable,
  projectsTable,
  phasesTable,
} from "@workspace/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

async function formatTimeBlock(tb: typeof timeBlocksTable.$inferSelect) {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, tb.userId)).limit(1);
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, tb.projectId))
    .limit(1);
  const phase = tb.phaseId
    ? await db.select().from(phasesTable).where(eq(phasesTable.id, tb.phaseId)).limit(1)
    : [];
  return {
    id: tb.id,
    userId: tb.userId,
    userName: user[0]
      ? `${user[0].firstName ?? ""} ${user[0].lastName ?? ""}`.trim() || user[0].username
      : "Unknown",
    projectId: tb.projectId,
    projectName: project[0]?.name ?? "Unknown",
    projectColor: project[0]?.color ?? null,
    phaseId: tb.phaseId,
    phaseName: phase[0]?.name ?? null,
    allocationId: tb.allocationId,
    date: tb.date,
    hours: parseFloat(tb.hours),
    type: tb.type,
    title: tb.title,
    description: tb.description,
    approved: tb.approved,
    createdAt: tb.createdAt.toISOString(),
  };
}

router.get("/timeblocks", async (req, res) => {
  const { userId, startDate, endDate, projectId } = req.query as Record<string, string>;
  const conditions = [];
  if (userId) conditions.push(eq(timeBlocksTable.userId, userId));
  if (projectId) conditions.push(eq(timeBlocksTable.projectId, projectId));
  if (startDate) conditions.push(gte(timeBlocksTable.date, startDate));
  if (endDate) conditions.push(lte(timeBlocksTable.date, endDate));

  const blocks = await db
    .select()
    .from(timeBlocksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(timeBlocksTable.date);

  const result = await Promise.all(blocks.map(formatTimeBlock));
  res.json(result);
});

router.post("/timeblocks", async (req, res) => {
  const { userId, projectId, phaseId, allocationId, date, hours, type, title, description } =
    req.body;
  if (!userId || !projectId || !date || hours === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const newBlock = await db
    .insert(timeBlocksTable)
    .values({
      id: randomUUID(),
      userId,
      projectId,
      phaseId: phaseId || null,
      allocationId: allocationId || null,
      date,
      hours: String(hours),
      type: type || "work",
      title: title || null,
      description: description || null,
      approved: false,
    })
    .returning();

  res.status(201).json(await formatTimeBlock(newBlock[0]));
});

router.put("/timeblocks/:id", async (req, res) => {
  const { date, hours, type, title, description, approved } = req.body;
  const updated = await db
    .update(timeBlocksTable)
    .set({
      date,
      hours: hours !== undefined ? String(hours) : undefined,
      type,
      title,
      description,
      approved,
      updatedAt: new Date(),
    })
    .where(eq(timeBlocksTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Time block not found" });
    return;
  }
  res.json(await formatTimeBlock(updated[0]));
});

router.delete("/timeblocks/:id", async (req, res) => {
  await db.delete(timeBlocksTable).where(eq(timeBlocksTable.id, req.params.id));
  res.status(204).send();
});

export default router;
