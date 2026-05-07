import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gcalAssignmentsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// GET /gcal/assignments — all assignments for the authenticated user
// Returns: { [eventKey]: { projectId, phaseId } }
router.get("/gcal/assignments", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const rows = await db
    .select()
    .from(gcalAssignmentsTable)
    .where(eq(gcalAssignmentsTable.userId, userId));

  const result: Record<string, { projectId: string; phaseId: string | null }> = {};
  for (const row of rows) {
    result[row.eventKey] = { projectId: row.projectId, phaseId: row.phaseId };
  }

  res.json(result);
});

// PUT /gcal/assignments — upsert a single assignment
// Body: { eventKey, projectId, phaseId? }
router.put("/gcal/assignments", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const { eventKey, projectId, phaseId } = req.body;

  if (!eventKey || !projectId) {
    res.status(400).json({ error: "eventKey and projectId are required" });
    return;
  }

  // Check if assignment already exists for this user+eventKey
  const [existing] = await db
    .select()
    .from(gcalAssignmentsTable)
    .where(
      and(
        eq(gcalAssignmentsTable.userId, userId),
        eq(gcalAssignmentsTable.eventKey, eventKey)
      )
    )
    .limit(1);

  if (existing) {
    // Update
    const [updated] = await db
      .update(gcalAssignmentsTable)
      .set({ projectId, phaseId: phaseId || null })
      .where(eq(gcalAssignmentsTable.id, existing.id))
      .returning();
    res.json({ eventKey: updated.eventKey, projectId: updated.projectId, phaseId: updated.phaseId });
  } else {
    // Insert
    const [created] = await db
      .insert(gcalAssignmentsTable)
      .values({
        id: randomUUID(),
        userId,
        eventKey,
        projectId,
        phaseId: phaseId || null,
      })
      .returning();
    res.status(201).json({ eventKey: created.eventKey, projectId: created.projectId, phaseId: created.phaseId });
  }
});

// PUT /gcal/assignments/bulk — bulk upsert assignments (from auto-match)
// Body: { assignments: { [eventKey]: { projectId, phaseId? } } }
router.put("/gcal/assignments/bulk", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const { assignments } = req.body;

  if (!assignments || typeof assignments !== "object") {
    res.status(400).json({ error: "assignments object is required" });
    return;
  }

  const entries = Object.entries(assignments) as [string, { projectId: string; phaseId?: string }][];
  let upserted = 0;

  for (const [eventKey, { projectId, phaseId }] of entries) {
    if (!eventKey || !projectId) continue;

    const [existing] = await db
      .select()
      .from(gcalAssignmentsTable)
      .where(
        and(
          eq(gcalAssignmentsTable.userId, userId),
          eq(gcalAssignmentsTable.eventKey, eventKey)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(gcalAssignmentsTable)
        .set({ projectId, phaseId: phaseId || null })
        .where(eq(gcalAssignmentsTable.id, existing.id));
    } else {
      await db
        .insert(gcalAssignmentsTable)
        .values({
          id: randomUUID(),
          userId,
          eventKey,
          projectId,
          phaseId: phaseId || null,
        });
    }
    upserted++;
  }

  res.json({ upserted });
});

// DELETE /gcal/assignments/:eventKey — remove an assignment
// eventKey is URL-encoded since it contains special chars
router.delete("/gcal/assignments/:eventKey", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const eventKey = decodeURIComponent(req.params.eventKey);

  await db
    .delete(gcalAssignmentsTable)
    .where(
      and(
        eq(gcalAssignmentsTable.userId, userId),
        eq(gcalAssignmentsTable.eventKey, eventKey)
      )
    );

  res.status(204).send();
});

export default router;
