import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  allocationsTable,
  usersTable,
  projectsTable,
  phasesTable,
  timeBlocksTable,
} from "@workspace/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

async function formatAllocation(a: typeof allocationsTable.$inferSelect) {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, a.userId)).limit(1);
  const project = await db.select().from(projectsTable).where(eq(projectsTable.id, a.projectId)).limit(1);
  const phase = a.phaseId
    ? await db.select().from(phasesTable).where(eq(phasesTable.id, a.phaseId)).limit(1)
    : [];
  const loggedConditions: ReturnType<typeof eq>[] = [
    eq(timeBlocksTable.userId, a.userId),
    eq(timeBlocksTable.projectId, a.projectId),
    gte(timeBlocksTable.date, a.startDate),
    lte(timeBlocksTable.date, a.endDate),
  ];
  if (a.phaseId) loggedConditions.push(eq(timeBlocksTable.phaseId, a.phaseId));

  const logged = await db
    .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
    .from(timeBlocksTable)
    .where(and(...loggedConditions));

  return {
    id: a.id,
    userId: a.userId,
    userName: user[0]
      ? `${user[0].firstName ?? ""} ${user[0].lastName ?? ""}`.trim() || user[0].username
      : "Unknown",
    projectId: a.projectId,
    projectName: project[0]?.name ?? "Unknown",
    projectColor: project[0]?.color ?? null,
    phaseId: a.phaseId,
    phaseName: phase[0]?.name ?? null,
    allocatedHours: parseFloat(a.allocatedHours),
    loggedHours: parseFloat(logged[0]?.total ?? "0"),
    startDate: a.startDate,
    endDate: a.endDate,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  };
}

router.get("/allocations", async (req, res) => {
  const { userId, projectId, weekStart, weekEnd } = req.query as Record<string, string>;

  const conditions = [];
  if (userId) conditions.push(eq(allocationsTable.userId, userId));
  if (projectId) conditions.push(eq(allocationsTable.projectId, projectId));
  if (weekStart) conditions.push(gte(allocationsTable.endDate, weekStart));
  if (weekEnd) conditions.push(lte(allocationsTable.startDate, weekEnd));

  const allocs = await db
    .select()
    .from(allocationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(allocationsTable.startDate);

  const result = await Promise.all(allocs.map(formatAllocation));
  res.json(result);
});

router.post("/allocations", async (req, res) => {
  const { userId: bodyUserId, projectId, phaseId, allocatedHours, startDate, endDate, notes } = req.body;
  if (!projectId || !allocatedHours || !startDate || !endDate) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  let resolvedUserId = bodyUserId;

  if (!resolvedUserId && req.isAuthenticated?.()) {
    resolvedUserId = (req.user as any)?.id;
  }

  if (!resolvedUserId) {
    const firstUser = await db.select().from(usersTable).limit(1);
    if (firstUser[0]) {
      resolvedUserId = firstUser[0].id;
    } else {
      const defaultId = randomUUID();
      const [created] = await db.insert(usersTable).values({
        id: defaultId,
        replitId: defaultId,
        username: "default",
        email: null,
        firstName: "Studio",
        lastName: "User",
        profileImage: null,
      }).returning();
      resolvedUserId = created.id;
    }
  }

  const newAlloc = await db
    .insert(allocationsTable)
    .values({
      id: randomUUID(),
      userId: resolvedUserId,
      projectId,
      phaseId: phaseId || null,
      allocatedHours: String(allocatedHours),
      startDate,
      endDate,
      notes: notes || null,
    })
    .returning();

  res.status(201).json(await formatAllocation(newAlloc[0]));
});

router.put("/allocations/:id", async (req, res) => {
  const { allocatedHours, startDate, endDate, notes } = req.body;
  const updated = await db
    .update(allocationsTable)
    .set({
      allocatedHours: allocatedHours !== undefined ? String(allocatedHours) : undefined,
      startDate,
      endDate,
      notes,
      updatedAt: new Date(),
    })
    .where(eq(allocationsTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Allocation not found" });
    return;
  }
  res.json(await formatAllocation(updated[0]));
});

router.delete("/allocations/:id", async (req, res) => {
  await db.delete(allocationsTable).where(eq(allocationsTable.id, req.params.id));
  res.status(204).send();
});

router.get("/utilization", async (req, res) => {
  const { weekStart, weekEnd } = req.query as Record<string, string>;
  if (!weekStart || !weekEnd) {
    res.status(400).json({ error: "weekStart and weekEnd are required" });
    return;
  }

  const users = await db.select().from(usersTable).orderBy(usersTable.firstName);

  const result = await Promise.all(
    users.map(async (user) => {
      const allocs = await db
        .select()
        .from(allocationsTable)
        .where(
          and(
            eq(allocationsTable.userId, user.id),
            lte(allocationsTable.startDate, weekEnd),
            gte(allocationsTable.endDate, weekStart)
          )
        );

      const allocatedHours = allocs.reduce((sum, a) => sum + parseFloat(a.allocatedHours), 0);

      const loggedResult = await db
        .select({ total: sql<string>`coalesce(sum(${timeBlocksTable.hours}), 0)` })
        .from(timeBlocksTable)
        .where(
          and(
            eq(timeBlocksTable.userId, user.id),
            gte(timeBlocksTable.date, weekStart),
            lte(timeBlocksTable.date, weekEnd)
          )
        );
      const loggedHours = parseFloat(loggedResult[0]?.total ?? "0");
      const targetHours = 40;
      const utilizationPercent = Math.round((allocatedHours / targetHours) * 100);
      const status =
        allocatedHours > targetHours ? "over" : allocatedHours < 20 ? "under" : "on_track";

      const projects = await Promise.all(
        allocs.map(async (a) => {
          const project = await db
            .select()
            .from(projectsTable)
            .where(eq(projectsTable.id, a.projectId))
            .limit(1);
          return {
            projectId: a.projectId,
            projectName: project[0]?.name ?? "Unknown",
            projectColor: project[0]?.color ?? null,
            allocatedHours: parseFloat(a.allocatedHours),
          };
        })
      );

      return {
        userId: user.id,
        userName:
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username,
        profileImage: user.profileImage,
        allocatedHours,
        loggedHours,
        targetHours,
        utilizationPercent,
        status,
        projects,
      };
    })
  );

  res.json(result);
});

export default router;
