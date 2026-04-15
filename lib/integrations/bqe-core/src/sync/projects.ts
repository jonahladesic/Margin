import { eq } from "drizzle-orm";
import { projectsTable, clientsTable } from "@workspace/db/schema";
import type { BqeClient } from "../client.js";
import type { SyncResult } from "../types.js";

/**
 * Pull projects from BQE Core and create/update local projects.
 */
export async function syncProjectsFromCore(
  bqeClient: BqeClient,
  db: any,
  generateId: () => string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, errors: 0, details: [] };

  try {
    const coreProjects = await bqeClient.getProjects({ expand: "client" });

    for (const cp of coreProjects) {
      try {
        const coreId = String(cp.id);
        const name = String(cp.name || "Untitled Project");
        const projectNumber = cp.projectNumber ? String(cp.projectNumber) : null;

        // Resolve client by coreClientId if present
        let clientId: string | null = null;
        if (cp.clientId) {
          const client = await db
            .select()
            .from(clientsTable)
            .where(eq(clientsTable.coreClientId, String(cp.clientId)))
            .limit(1);
          if (client.length > 0) clientId = client[0].id;
        }

        // Map Core status to local workStatus
        const coreStatus = String(cp.status || "").toLowerCase();
        let status: "active" | "on_hold" | "completed" | "cancelled" = "active";
        if (coreStatus.includes("complete") || coreStatus.includes("closed")) status = "completed";
        else if (coreStatus.includes("hold") || coreStatus.includes("inactive")) status = "on_hold";
        else if (coreStatus.includes("cancel")) status = "cancelled";

        // Check if we already have this project mapped
        const existing = await db
          .select()
          .from(projectsTable)
          .where(eq(projectsTable.coreProjectId, coreId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(projectsTable)
            .set({
              name,
              coreProjectNumber: projectNumber,
              clientId: clientId || existing[0].clientId,
              status,
              budgetAmount: cp.contractAmount ? String(cp.contractAmount) : undefined,
              startDate: cp.startDate ? String(cp.startDate).split("T")[0] : undefined,
              endDate: cp.endDate ? String(cp.endDate).split("T")[0] : undefined,
              description: cp.description ? String(cp.description) : undefined,
              updatedAt: new Date(),
            })
            .where(eq(projectsTable.id, existing[0].id));
          result.updated++;
          result.details.push(`Updated project: ${name}`);
        } else {
          await db.insert(projectsTable).values({
            id: generateId(),
            name,
            coreProjectId: coreId,
            coreProjectNumber: projectNumber,
            clientId,
            status,
            budgetAmount: cp.contractAmount ? String(cp.contractAmount) : null,
            startDate: cp.startDate ? String(cp.startDate).split("T")[0] : null,
            endDate: cp.endDate ? String(cp.endDate).split("T")[0] : null,
            description: cp.description ? String(cp.description) : null,
            billingCategory: "billable",
          });
          result.created++;
          result.details.push(`Created project: ${name} (${projectNumber || "no number"})`);
        }
      } catch (e: any) {
        result.errors++;
        result.details.push(`Error syncing project ${cp.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors++;
    result.details.push(`Failed to fetch projects from Core: ${e.message}`);
  }

  return result;
}
