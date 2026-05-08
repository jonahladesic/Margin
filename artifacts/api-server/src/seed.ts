import { db } from "@workspace/db";
import { projectsTable, phasesTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const INTERNAL_COLOR = "#E8772E";
const INTERNAL_PHASES = [
  "PTO",
  "Weekly WOW",
  "Admin",
  "Training",
  "Other",
];

/** Seed test users for dev-mode role switching */
const TEST_USERS = [
  {
    id: "user-admin-001",
    replitId: "admin-001",
    username: "jonahlad",
    firstName: "Jonah",
    lastName: "Ladesic",
    email: "jonahlad@gmail.com",
    role: "admin" as const,
  },
  {
    id: "user-pm-001",
    replitId: "pm-001",
    username: "sarah.pm",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@example.com",
    role: "pm" as const,
  },
  {
    id: "user-designer-001",
    replitId: "designer-001",
    username: "james.designer",
    firstName: "James",
    lastName: "Rivera",
    email: "james.rivera@example.com",
    role: "designer" as const,
  },
  {
    id: "user-designer-002",
    replitId: "designer-002",
    username: "maya.designer",
    firstName: "Maya",
    lastName: "Patel",
    email: "maya.patel@example.com",
    role: "designer" as const,
  },
];

export async function seedTestUsers() {
  for (const user of TEST_USERS) {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(usersTable).values(user);
      console.log(`Seeded test user: ${user.firstName} ${user.lastName} (${user.role})`);
    }
  }
}

export async function seedInternalProject() {
  let existing = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.isInternal, true))
    .limit(1);

  let projectId: string;

  if (existing.length === 0) {
    projectId = randomUUID();
    await db.insert(projectsTable).values({
      id: projectId,
      name: "Internal",
      clientId: null,
      status: "active",
      type: "other",
      workStatus: "working_internally",
      isInternal: true,
      budgetedHours: "0",
      color: INTERNAL_COLOR,
      ntpReceived: false,
      paymentStatus: "unpaid",
    });
    console.log("Created Internal project");
  } else {
    projectId = existing[0].id;
  }

  const existingPhases = await db
    .select({ name: phasesTable.name })
    .from(phasesTable)
    .where(eq(phasesTable.projectId, projectId));

  const existingNames = new Set(existingPhases.map((p) => p.name));
  const missingPhases = INTERNAL_PHASES.filter((name) => !existingNames.has(name));

  if (missingPhases.length > 0) {
    await db.insert(phasesTable).values(
      missingPhases.map((name, idx) => ({
        id: randomUUID(),
        projectId,
        name,
        budgetedHours: "0",
        status: "upcoming" as const,
        enabled: true,
        sortOrder: String(existingPhases.length + idx),
      }))
    );
    console.log(`Seeded Internal phases: ${missingPhases.join(", ")}`);
  }
}
