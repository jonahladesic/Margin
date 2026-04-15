import { eq, isNull, and } from "drizzle-orm";
import { timeBlocksTable, projectsTable, phasesTable } from "@workspace/db/schema";
import type { BqeClient } from "../client.js";
import type { SyncResult } from "../types.js";

/**
 * Push unsynced timeblocks to BQE Core as time entries.
 * Only pushes timeblocks for projects that have a coreProjectId.
 */
export async function pushTimeEntriesToCore(
  bqeClient: BqeClient,
  db: any
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, errors: 0, details: [] };

  try {
    // Get all timeblocks that haven't been synced yet
    const unsyncedBlocks = await db
      .select({
        timeblock: timeBlocksTable,
        coreProjectId: projectsTable.coreProjectId,
        coreActivityId: phasesTable.coreActivityId,
      })
      .from(timeBlocksTable)
      .innerJoin(projectsTable, eq(timeBlocksTable.projectId, projectsTable.id))
      .leftJoin(phasesTable, eq(timeBlocksTable.phaseId, phasesTable.id))
      .where(
        and(
          isNull(timeBlocksTable.coreTimeEntryId),
          // Only push for Core-linked projects
        )
      );

    // Filter to only Core-linked projects
    const toSync = unsyncedBlocks.filter((row: any) => row.coreProjectId);

    for (const row of toSync) {
      try {
        const tb = row.timeblock;
        const entry: Record<string, unknown> = {
          projectId: row.coreProjectId,
          date: tb.date,
          hours: Number(tb.hours),
          description: tb.description || tb.title || "",
          billable: true,
        };

        if (row.coreActivityId) {
          entry.activityId = row.coreActivityId;
        }

        const created = await bqeClient.createTimeEntry(entry);
        const coreId = String(created.id || created.Id || "");

        if (coreId) {
          await db
            .update(timeBlocksTable)
            .set({ coreTimeEntryId: coreId, updatedAt: new Date() })
            .where(eq(timeBlocksTable.id, tb.id));
          result.created++;
          result.details.push(`Pushed time entry: ${tb.date} ${tb.hours}h`);
        } else {
          result.errors++;
          result.details.push(`No ID returned for time entry on ${tb.date}`);
        }
      } catch (e: any) {
        result.errors++;
        result.details.push(`Error pushing time entry ${row.timeblock.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors++;
    result.details.push(`Failed to push time entries: ${e.message}`);
  }

  return result;
}

/**
 * Push a single timeblock to BQE Core.
 */
export async function pushSingleTimeEntry(
  bqeClient: BqeClient,
  db: any,
  timeblockId: string
): Promise<{ success: boolean; coreId?: string; error?: string }> {
  try {
    const rows = await db
      .select({
        timeblock: timeBlocksTable,
        coreProjectId: projectsTable.coreProjectId,
        coreActivityId: phasesTable.coreActivityId,
      })
      .from(timeBlocksTable)
      .innerJoin(projectsTable, eq(timeBlocksTable.projectId, projectsTable.id))
      .leftJoin(phasesTable, eq(timeBlocksTable.phaseId, phasesTable.id))
      .where(eq(timeBlocksTable.id, timeblockId))
      .limit(1);

    if (rows.length === 0) return { success: false, error: "Timeblock not found" };
    if (!rows[0].coreProjectId) return { success: false, error: "Project not linked to Core" };

    const row = rows[0];
    const tb = row.timeblock;

    const entry: Record<string, unknown> = {
      projectId: row.coreProjectId,
      date: tb.date,
      hours: Number(tb.hours),
      description: tb.description || tb.title || "",
      billable: true,
    };
    if (row.coreActivityId) entry.activityId = row.coreActivityId;

    const created = await bqeClient.createTimeEntry(entry);
    const coreId = String(created.id || created.Id || "");

    if (coreId) {
      await db
        .update(timeBlocksTable)
        .set({ coreTimeEntryId: coreId, updatedAt: new Date() })
        .where(eq(timeBlocksTable.id, tb.id));
      return { success: true, coreId };
    }
    return { success: false, error: "No ID returned from Core" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
