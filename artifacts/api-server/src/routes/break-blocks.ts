import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { breakBlocksTable } from "@workspace/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { generateRecurrenceDates } from "../lib/recurrence";

const router: IRouter = Router();

function formatBlock(b: typeof breakBlocksTable.$inferSelect) {
  return {
    id: b.id,
    userId: b.userId,
    date: b.date,
    startTime: parseFloat(b.startTime),
    hours: parseFloat(b.hours),
    label: b.label,
    color: b.color,
    recurrenceRule: b.recurrenceRule,
    seriesId: b.seriesId,
  };
}

router.get("/break-blocks", async (req, res) => {
  const { startDate, endDate, userId } = req.query as Record<string, string>;
  const conditions = [];
  if (userId) conditions.push(eq(breakBlocksTable.userId, userId));
  if (startDate) conditions.push(gte(breakBlocksTable.date, startDate));
  if (endDate) conditions.push(lte(breakBlocksTable.date, endDate));

  const blocks = await db
    .select()
    .from(breakBlocksTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(breakBlocksTable.date);

  res.json(blocks.map(formatBlock));
});

router.post("/break-blocks", async (req, res) => {
  const { date, startTime, hours, label, color, recurrenceRule, userId } = req.body;
  if (!date || startTime == null || hours == null) {
    res.status(400).json({ error: "date, startTime, and hours are required" });
    return;
  }

  const seriesId = recurrenceRule ? randomUUID() : null;

  const block = await db
    .insert(breakBlocksTable)
    .values({
      id: randomUUID(),
      userId: userId || null,
      date,
      startTime: String(startTime),
      hours: String(hours),
      label: label || "Break",
      color: color || "#6b7280",
      recurrenceRule: recurrenceRule || null,
      seriesId,
    })
    .returning();

  if (recurrenceRule && seriesId) {
    const futureDates = generateRecurrenceDates(date, recurrenceRule);
    if (futureDates.length > 0) {
      await db.insert(breakBlocksTable).values(
        futureDates.map((d) => ({
          id: randomUUID(),
          userId: userId || null,
          date: d,
          startTime: String(startTime),
          hours: String(hours),
          label: label || "Break",
          color: color || "#6b7280",
          recurrenceRule,
          seriesId,
        }))
      );
    }
  }

  res.status(201).json(formatBlock(block[0]));
});

router.route("/break-blocks/:id")
  .put(async (req, res) => {
    const { date, startTime, scope } = req.body;
    const updateData: Record<string, any> = {};
    if (date !== undefined) updateData.date = date;
    if (startTime !== undefined) updateData.startTime = String(startTime);

    if (scope === "all" || scope === "future") {
      const [block] = await db.select().from(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
      if (!block) { res.status(404).json({ error: "Break block not found" }); return; }

      if (block.seriesId) {
        const conditions = [eq(breakBlocksTable.seriesId, block.seriesId)];
        if (scope === "future") {
          conditions.push(gte(breakBlocksTable.date, block.date));
        }
        const seriesUpdate: Record<string, any> = {};
        if (startTime !== undefined) seriesUpdate.startTime = String(startTime);
        if (Object.keys(seriesUpdate).length > 0) {
          await db.update(breakBlocksTable).set(seriesUpdate).where(and(...conditions));
        }
      }
      const [updated] = await db.select().from(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
      res.json(formatBlock(updated));
    } else {
      const updated = await db
        .update(breakBlocksTable)
        .set(updateData)
        .where(eq(breakBlocksTable.id, req.params.id))
        .returning();
      if (!updated[0]) { res.status(404).json({ error: "Break block not found" }); return; }
      res.json(formatBlock(updated[0]));
    }
  })
  .delete(async (req, res) => {
    const scope = (req.query.scope as string) || "single";

    if (scope === "all" || scope === "future") {
      const [block] = await db.select().from(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
      if (block?.seriesId) {
        const conditions = [eq(breakBlocksTable.seriesId, block.seriesId)];
        if (scope === "future") {
          conditions.push(gte(breakBlocksTable.date, block.date));
        }
        await db.delete(breakBlocksTable).where(and(...conditions));
      } else {
        await db.delete(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
      }
    } else {
      await db.delete(breakBlocksTable).where(eq(breakBlocksTable.id, req.params.id));
    }

    res.status(204).send();
  });

export default router;
