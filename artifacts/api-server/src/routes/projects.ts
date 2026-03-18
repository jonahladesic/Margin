import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  projectsTable,
  clientsTable,
  phasesTable,
  timeBlocksTable,
  projectMembersTable,
} from "@workspace/db/schema";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function formatProject(p: typeof projectsTable.$inferSelect, clientName: string | null, loggedHours: number, billedAmount: number) {
  return {
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName,
    status: p.status,
    type: p.type,
    workStatus: p.workStatus,
    budgetedHours: parseFloat(p.budgetedHours ?? "0"),
    loggedHours,
    budgetAmount: p.budgetAmount ? parseFloat(p.budgetAmount) : null,
    billedAmount,
    startDate: p.startDate,
    endDate: p.endDate,
    description: p.description,
    color: p.color,
    ntpReceived: p.ntpReceived,
    ntpDate: p.ntpDate,
    paymentStatus: p.paymentStatus,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/projects", async (_req, res) => {
  const projects = await db
    .select({
      project: projectsTable,
      clientName: clientsTable.name,
    })
    .from(projectsTable)
    .leftJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .orderBy(projectsTable.createdAt);

  const result = await Promise.all(
    projects.map(async ({ project, clientName }) => {
      const logged = await db
        .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
        .from(timeBlocksTable)
        .where(eq(timeBlocksTable.projectId, project.id));
      return formatProject(project, clientName, parseFloat(logged[0]?.total ?? "0"), 0);
    })
  );

  res.json(result);
});

router.get("/projects/:id", async (req, res) => {
  const project = await db
    .select({ project: projectsTable, clientName: clientsTable.name })
    .from(projectsTable)
    .leftJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectsTable.id, req.params.id))
    .limit(1);

  if (!project[0]) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { project: p, clientName } = project[0];
  const logged = await db
    .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
    .from(timeBlocksTable)
    .where(eq(timeBlocksTable.projectId, p.id));

  res.json(formatProject(p, clientName, parseFloat(logged[0]?.total ?? "0"), 0));
});

router.post("/projects", async (req, res) => {
  const {
    name, clientId, status, type, workStatus, budgetedHours, budgetAmount,
    startDate, endDate, description, color,
    ntpReceived, ntpDate, paymentStatus, phases,
  } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const projectId = randomUUID();

  const totalBudgeted = Array.isArray(phases)
    ? phases.reduce((sum: number, p: any) => sum + (Number(p.budgetedHours) || 0), 0)
    : Number(budgetedHours ?? 0);

  const newProject = await db
    .insert(projectsTable)
    .values({
      id: projectId,
      name,
      clientId: clientId || null,
      status: status || "active",
      type: type || "other",
      workStatus: workStatus || "working_internally",
      budgetedHours: String(totalBudgeted),
      budgetAmount: budgetAmount ? String(budgetAmount) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      description: description || null,
      color: color || null,
      ntpReceived: ntpReceived ?? false,
      ntpDate: ntpDate || null,
      paymentStatus: paymentStatus || "unpaid",
    })
    .returning();

  if (Array.isArray(phases) && phases.length > 0) {
    await db.insert(phasesTable).values(
      phases.map((ph: any, idx: number) => ({
        id: randomUUID(),
        projectId,
        name: ph.name,
        budgetedHours: String(ph.budgetedHours ?? 0),
        status: "upcoming" as const,
        enabled: ph.enabled !== false,
        sortOrder: String(idx),
      }))
    );
  }

  const p = newProject[0];
  res.status(201).json(formatProject(p, null, 0, 0));
});

router.put("/projects/:id", async (req, res) => {
  const {
    name, clientId, status, type, workStatus, budgetedHours, budgetAmount,
    startDate, endDate, description, color,
    ntpReceived, ntpDate, paymentStatus,
  } = req.body;
  const updated = await db
    .update(projectsTable)
    .set({
      name,
      clientId: clientId ?? undefined,
      status,
      type,
      workStatus: workStatus ?? undefined,
      budgetedHours: budgetedHours !== undefined ? String(budgetedHours) : undefined,
      budgetAmount: budgetAmount !== undefined ? String(budgetAmount) : undefined,
      startDate,
      endDate,
      description,
      color,
      ntpReceived: ntpReceived ?? undefined,
      ntpDate: ntpDate ?? undefined,
      paymentStatus: paymentStatus ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(projectsTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const p = updated[0];
  const clientRow = p.clientId
    ? await db.select().from(clientsTable).where(eq(clientsTable.id, p.clientId)).limit(1)
    : [];
  const logged = await db
    .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
    .from(timeBlocksTable)
    .where(eq(timeBlocksTable.projectId, p.id));
  res.json(formatProject(p, clientRow[0]?.name ?? null, parseFloat(logged[0]?.total ?? "0"), 0));
});

router.get("/projects/:id/phases", async (req, res) => {
  const phases = await db
    .select()
    .from(phasesTable)
    .where(eq(phasesTable.projectId, req.params.id))
    .orderBy(phasesTable.createdAt);

  const result = await Promise.all(
    phases.map(async (ph) => {
      const logged = await db
        .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
        .from(timeBlocksTable)
        .where(eq(timeBlocksTable.phaseId, ph.id));
      const subPhaseTotals = await db
        .select({
          subPhase: timeBlocksTable.subPhase,
          total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)`,
        })
        .from(timeBlocksTable)
        .where(eq(timeBlocksTable.phaseId, ph.id))
        .groupBy(timeBlocksTable.subPhase);

      return {
        id: ph.id,
        projectId: ph.projectId,
        name: ph.name,
        budgetedHours: parseFloat(ph.budgetedHours ?? "0"),
        loggedHours: parseFloat(logged[0]?.total ?? "0"),
        enabled: ph.enabled,
        sortOrder: parseFloat(ph.sortOrder ?? "0"),
        startDate: ph.startDate,
        endDate: ph.endDate,
        status: ph.status,
        kickoffDate: ph.kickoffDate,
        deadlineDate: ph.deadlineDate,
        pageTurnDate: ph.pageTurnDate,
        subPhaseTotals: Object.fromEntries(
          subPhaseTotals.map((s) => [s.subPhase ?? "unassigned", parseFloat(s.total)])
        ),
        createdAt: ph.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/projects/:id/phases", async (req, res) => {
  const { name, budgetedHours, startDate, endDate, kickoffDate, deadlineDate, pageTurnDate, enabled, sortOrder } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const newPhase = await db
    .insert(phasesTable)
    .values({
      id: randomUUID(),
      projectId: req.params.id,
      name,
      budgetedHours: String(budgetedHours ?? 0),
      startDate: startDate || null,
      endDate: endDate || null,
      kickoffDate: kickoffDate || null,
      deadlineDate: deadlineDate || null,
      pageTurnDate: pageTurnDate || null,
      enabled: enabled !== false,
      sortOrder: sortOrder !== undefined ? String(sortOrder) : "0",
    })
    .returning();

  const ph = newPhase[0];
  res.status(201).json({
    id: ph.id,
    projectId: ph.projectId,
    name: ph.name,
    budgetedHours: parseFloat(ph.budgetedHours ?? "0"),
    loggedHours: 0,
    startDate: ph.startDate,
    endDate: ph.endDate,
    status: ph.status,
    kickoffDate: ph.kickoffDate,
    deadlineDate: ph.deadlineDate,
    pageTurnDate: ph.pageTurnDate,
    createdAt: ph.createdAt.toISOString(),
  });
});

router.get("/projects/:id/members", async (req, res) => {
  const members = await db
    .select()
    .from(projectMembersTable)
    .where(eq(projectMembersTable.projectId, req.params.id))
    .orderBy(projectMembersTable.createdAt);

  res.json(members.map((m) => ({
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/projects/:id/members", async (req, res) => {
  const { name, role } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const newMember = await db
    .insert(projectMembersTable)
    .values({
      id: randomUUID(),
      projectId: req.params.id,
      name,
      role: role || "designer",
    })
    .returning();

  const m = newMember[0];
  res.status(201).json({
    id: m.id,
    projectId: m.projectId,
    name: m.name,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  });
});

router.delete("/projects/:id/members/:memberId", async (req, res) => {
  const deleted = await db
    .delete(projectMembersTable)
    .where(and(
      eq(projectMembersTable.id, req.params.memberId),
      eq(projectMembersTable.projectId, req.params.id),
    ))
    .returning();

  if (!deleted[0]) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.status(204).end();
});

export default router;
