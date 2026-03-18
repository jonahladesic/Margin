import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { phasesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.put("/phases/:id", async (req, res) => {
  const { name, budgetedHours, startDate, endDate, status, kickoffDate, deadlineDate, pageTurnDate, enabled, sortOrder } = req.body;
  const updated = await db
    .update(phasesTable)
    .set({
      name,
      budgetedHours: budgetedHours !== undefined ? String(budgetedHours) : undefined,
      startDate,
      endDate,
      status,
      kickoffDate,
      deadlineDate,
      pageTurnDate,
      enabled: enabled !== undefined ? enabled : undefined,
      sortOrder: sortOrder !== undefined ? String(sortOrder) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(phasesTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  const ph = updated[0];
  res.json({
    id: ph.id,
    projectId: ph.projectId,
    name: ph.name,
    budgetedHours: parseFloat(ph.budgetedHours ?? "0"),
    loggedHours: 0,
    enabled: ph.enabled,
    sortOrder: parseFloat(ph.sortOrder ?? "0"),
    startDate: ph.startDate,
    endDate: ph.endDate,
    status: ph.status,
    kickoffDate: ph.kickoffDate,
    deadlineDate: ph.deadlineDate,
    pageTurnDate: ph.pageTurnDate,
    createdAt: ph.createdAt.toISOString(),
  });
});

router.delete("/phases/:id", async (req, res) => {
  const { eq } = await import("drizzle-orm");
  await db.delete(phasesTable).where(eq(phasesTable.id, req.params.id));
  res.status(204).send();
});

export default router;
