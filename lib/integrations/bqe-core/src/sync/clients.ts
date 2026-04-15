import { eq } from "drizzle-orm";
import { clientsTable } from "@workspace/db/schema";
import type { BqeClient } from "../client.js";
import type { SyncResult } from "../types.js";

/**
 * Pull clients from BQE Core and create/update local clients.
 */
export async function syncClientsFromCore(
  bqeClient: BqeClient,
  db: any,
  generateId: () => string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, errors: 0, details: [] };

  try {
    const coreClients = await bqeClient.getClients();

    for (const cc of coreClients) {
      try {
        const coreId = String(cc.id);
        const name = String(cc.name || "Unknown Client");

        // Check if we already have this client mapped
        const existing = await db
          .select()
          .from(clientsTable)
          .where(eq(clientsTable.coreClientId, coreId))
          .limit(1);

        if (existing.length > 0) {
          // Update existing client
          await db
            .update(clientsTable)
            .set({
              name,
              email: cc.email ? String(cc.email) : undefined,
              phone: cc.phone ? String(cc.phone) : undefined,
              updatedAt: new Date(),
            })
            .where(eq(clientsTable.id, existing[0].id));
          result.updated++;
          result.details.push(`Updated client: ${name}`);
        } else {
          // Try to match by name first (for first-time sync)
          const nameMatch = await db
            .select()
            .from(clientsTable)
            .where(eq(clientsTable.name, name))
            .limit(1);

          if (nameMatch.length > 0) {
            // Link existing client to Core
            await db
              .update(clientsTable)
              .set({ coreClientId: coreId, updatedAt: new Date() })
              .where(eq(clientsTable.id, nameMatch[0].id));
            result.updated++;
            result.details.push(`Linked existing client: ${name}`);
          } else {
            // Create new client
            await db.insert(clientsTable).values({
              id: generateId(),
              name,
              email: cc.email ? String(cc.email) : null,
              phone: cc.phone ? String(cc.phone) : null,
              address: cc.address ? String(cc.address) : null,
              coreClientId: coreId,
            });
            result.created++;
            result.details.push(`Created client: ${name}`);
          }
        }
      } catch (e: any) {
        result.errors++;
        result.details.push(`Error syncing client ${cc.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors++;
    result.details.push(`Failed to fetch clients from Core: ${e.message}`);
  }

  return result;
}
