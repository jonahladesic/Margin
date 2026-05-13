import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { gcalAssignmentsTable, projectsTable } from "@workspace/db/schema";
import { and, eq, gte, lte, sql, isNotNull } from "drizzle-orm";
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
// Body: { eventKey, projectId, phaseId?, durationHours?, eventTitle?, eventDate? }
router.put("/gcal/assignments", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const { eventKey, projectId, phaseId, durationHours, eventTitle, eventDate } = req.body;

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
      .set({
        projectId,
        phaseId: phaseId || null,
        durationHours: durationHours != null ? durationHours : existing.durationHours,
        eventTitle: eventTitle || existing.eventTitle,
        eventDate: eventDate || existing.eventDate,
      })
      .where(eq(gcalAssignmentsTable.id, existing.id))
      .returning();
    res.json({
      eventKey: updated.eventKey,
      projectId: updated.projectId,
      phaseId: updated.phaseId,
      durationHours: updated.durationHours,
      eventTitle: updated.eventTitle,
      eventDate: updated.eventDate,
    });
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
        durationHours: durationHours != null ? durationHours : null,
        eventTitle: eventTitle || null,
        eventDate: eventDate || null,
      })
      .returning();
    res.status(201).json({
      eventKey: created.eventKey,
      projectId: created.projectId,
      phaseId: created.phaseId,
      durationHours: created.durationHours,
      eventTitle: created.eventTitle,
      eventDate: created.eventDate,
    });
  }
});

// PUT /gcal/assignments/bulk — bulk upsert assignments (from auto-match)
// Body: { assignments: [{ eventKey, projectId, phaseId?, durationHours?, eventTitle?, eventDate? }] }
//   OR: { assignments: { [eventKey]: { projectId, phaseId? } } } (legacy object format)
router.put("/gcal/assignments/bulk", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const { assignments } = req.body;

  if (!assignments || typeof assignments !== "object") {
    res.status(400).json({ error: "assignments is required" });
    return;
  }

  // Support both array format and legacy object format
  let entries: Array<{
    eventKey: string;
    projectId: string;
    phaseId?: string;
    durationHours?: number;
    eventTitle?: string;
    eventDate?: string;
  }>;

  if (Array.isArray(assignments)) {
    entries = assignments;
  } else {
    // Legacy object format: { [eventKey]: { projectId, phaseId? } }
    entries = Object.entries(assignments).map(([eventKey, val]: [string, any]) => ({
      eventKey,
      projectId: val.projectId,
      phaseId: val.phaseId,
    }));
  }

  let upserted = 0;

  for (const entry of entries) {
    const { eventKey, projectId, phaseId, durationHours, eventTitle, eventDate } = entry;
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
        .set({
          projectId,
          phaseId: phaseId || null,
          durationHours: durationHours != null ? durationHours : existing.durationHours,
          eventTitle: eventTitle || existing.eventTitle,
          eventDate: eventDate || existing.eventDate,
        })
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
          durationHours: durationHours != null ? durationHours : null,
          eventTitle: eventTitle || null,
          eventDate: eventDate || null,
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

// GET /gcal/hours — aggregated hours from GCal assignments
// Query: startDate, endDate (optional, ISO date strings YYYY-MM-DD)
// Returns: { totalHours, byProject: { [projectId]: { hours, projectName, projectColor, phases: { [phaseId]: hours } } } }
router.get("/gcal/hours", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = req.user.id;
  const { startDate, endDate } = req.query as Record<string, string>;

  const conditions = [
    eq(gcalAssignmentsTable.userId, userId),
    isNotNull(gcalAssignmentsTable.durationHours),
  ];

  if (startDate) {
    conditions.push(gte(gcalAssignmentsTable.eventDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(gcalAssignmentsTable.eventDate, endDate));
  }

  const rows = await db
    .select({
      projectId: gcalAssignmentsTable.projectId,
      phaseId: gcalAssignmentsTable.phaseId,
      durationHours: gcalAssignmentsTable.durationHours,
    })
    .from(gcalAssignmentsTable)
    .where(and(...conditions));

  // Also fetch project metadata for display
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const projectMeta: Record<string, { name: string; color: string | null }> = {};
  for (const pid of projectIds) {
    const [p] = await db
      .select({ name: projectsTable.name, color: projectsTable.color })
      .from(projectsTable)
      .where(eq(projectsTable.id, pid))
      .limit(1);
    if (p) projectMeta[pid] = p;
  }

  let totalHours = 0;
  const byProject: Record<
    string,
    { hours: number; projectName: string; projectColor: string | null; phases: Record<string, number> }
  > = {};

  for (const row of rows) {
    const hours = row.durationHours ?? 0;
    totalHours += hours;

    if (!byProject[row.projectId]) {
      byProject[row.projectId] = {
        hours: 0,
        projectName: projectMeta[row.projectId]?.name ?? "Unknown",
        projectColor: projectMeta[row.projectId]?.color ?? null,
        phases: {},
      };
    }

    byProject[row.projectId].hours += hours;

    if (row.phaseId) {
      byProject[row.projectId].phases[row.phaseId] =
        (byProject[row.projectId].phases[row.phaseId] || 0) + hours;
    }
  }

  res.json({ totalHours, byProject });
});

export default router;
