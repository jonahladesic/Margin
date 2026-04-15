import { eq } from "drizzle-orm";
import { phasesTable, projectsTable } from "@workspace/db/schema";
import type { BqeClient } from "../client.js";
import type { SyncResult } from "../types.js";

/**
 * Pull activities (phases) from BQE Core for a specific project.
 */
export async function syncPhasesFromCore(
  bqeClient: BqeClient,
  db: any,
  localProjectId: string,
  generateId: () => string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, errors: 0, details: [] };

  try {
    // Get the project's coreProjectId
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, localProjectId))
      .limit(1);

    if (project.length === 0 || !project[0].coreProjectId) {
      result.errors++;
      result.details.push("Project not found or not linked to Core");
      return result;
    }

    const coreProjectId = project[0].coreProjectId;
    const coreActivities = await bqeClient.getActivitiesByProject(coreProjectId);

    // Get existing phases for sort order
    const existingPhases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.projectId, localProjectId));

    let maxSortOrder = existingPhases.reduce(
      (max: number, p: any) => Math.max(max, Number(p.sortOrder) || 0),
      0
    );

    for (const ca of coreActivities) {
      try {
        const coreId = String(ca.id);
        const name = String(ca.name || "Untitled Phase");

        const existing = await db
          .select()
          .from(phasesTable)
          .where(eq(phasesTable.coreActivityId, coreId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(phasesTable)
            .set({
              name,
              budgetedHours: ca.budget ? String(ca.budget) : undefined,
              enabled: ca.isActive !== false,
              updatedAt: new Date(),
            })
            .where(eq(phasesTable.id, existing[0].id));
          result.updated++;
          result.details.push(`Updated phase: ${name}`);
        } else {
          maxSortOrder += 1;
          await db.insert(phasesTable).values({
            id: generateId(),
            projectId: localProjectId,
            name,
            coreActivityId: coreId,
            budgetedHours: ca.budget ? String(ca.budget) : "0",
            enabled: ca.isActive !== false,
            sortOrder: String(maxSortOrder),
            status: "upcoming",
          });
          result.created++;
          result.details.push(`Created phase: ${name}`);
        }
      } catch (e: any) {
        result.errors++;
        result.details.push(`Error syncing activity ${ca.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors++;
    result.details.push(`Failed to fetch activities from Core: ${e.message}`);
  }

  return result;
}

/**
 * Pull activities for ALL Core-linked projects.
 */
export async function syncAllPhasesFromCore(
  bqeClient: BqeClient,
  db: any,
  generateId: () => string
): Promise<SyncResult> {
  const combined: SyncResult = { created: 0, updated: 0, errors: 0, details: [] };

  const coreProjects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.coreProjectId, projectsTable.coreProjectId)); // NOT NULL check via Drizzle

  // Get all projects that have a coreProjectId
  const projects = await db
    .select({ id: projectsTable.id, coreProjectId: projectsTable.coreProjectId })
    .from(projectsTable);

  const linkedProjects = projects.filter((p: any) => p.coreProjectId);

  for (const project of linkedProjects) {
    const r = await syncPhasesFromCore(bqeClient, db, project.id, generateId);
    combined.created += r.created;
    combined.updated += r.updated;
    combined.errors += r.errors;
    combined.details.push(...r.details);
  }

  return combined;
}
