import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { breakBlocksTable } from "@workspace/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.get("/break-blocks", async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string>;
  const conditions = [];
  if (startDate) conditions.push(gte(breakBlocksTable.date, startDate));
  if (endDate) conditions.push(lte(breakBlocksTable.date, endDate));

  const blocks = await db
    .select()
    .from(breakBlocksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(breakBlocksTable.date);

  res.json(blocks.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: parseFloat(b.startTime),
    hours: parseFloat(b.hours),
    label: b.label,
    color: b.color,
  })));
});

router.post("/break-blocks", async (req, res) => {
  const { date, startTime, hours, label, color } = req.body;
  if (!date || startTime == null || hours == null) {
    res.status(400).json({ error: "date, startTime, and hours are required" });
    return;
  }
  const block = await db
    .insert(breakBlocksTable)
    .values({
      id: randomUUID(),
      date,
      startTime: String(startTime),
      hours: String(hours),
      label: label || "Break",
      color: color || "#6b7280",
    })
    .returning();

  const b = block[0];
  res.status(201).json({
    id: b.id,
    date: b.date,
    startTime: parseFloat(b.startTime),
    hours: parseFloat(b.hours),
    label: b.label,
    color: b.color,
  });
});

router.delete("/break-blocks/:id", async (req, res) => {
  await db.delete(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
  res.status(204).send();
});

export default router;
