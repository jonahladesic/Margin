import { db } from "@workspace/db";
import { projectsTable, phasesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const RSM_INTERNAL_COLOR = "#16a34a";
const RSM_INTERNAL_PHASES = [
  "PTO",
  "Weekly WOW",
  "Admin",
  "Training",
  "Other",
];

export async function seedRSMInternal() {
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
      name: "RSM Internal",
      clientId: null,
      status: "active",
      type: "other",
      workStatus: "working_internally",
      isInternal: true,
      budgetedHours: "0",
      color: RSM_INTERNAL_COLOR,
      ntpReceived: false,
      paymentStatus: "unpaid",
    });
    console.log("Created RSM Internal project");
  } else {
    projectId = existing[0].id;
  }

  const existingPhases = await db
    .select()
    .from(phasesTable)
    .where(eq(phasesTable.projectId, projectId));

  if (existingPhases.length === 0) {
    await db.insert(phasesTable).values(
      RSM_INTERNAL_PHASES.map((name, idx) => ({
        id: randomUUID(),
        projectId,
        name,
        budgetedHours: "0",
        status: "upcoming" as const,
        enabled: true,
        sortOrder: String(idx),
      }))
    );
    console.log("Seeded RSM Internal overhead phases");
  }
}
