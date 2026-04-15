import { eq } from "drizzle-orm";
import { invoicesTable, projectsTable } from "@workspace/db/schema";
import type { BqeClient } from "../client.js";

/**
 * Create an invoice in BQE Core from a local invoice.
 */
export async function pushInvoiceToCore(
  bqeClient: BqeClient,
  db: any,
  localInvoiceId: string
): Promise<{ success: boolean; coreInvoiceId?: string; error?: string }> {
  try {
    const invoices = await db
      .select({
        invoice: invoicesTable,
        coreProjectId: projectsTable.coreProjectId,
      })
      .from(invoicesTable)
      .innerJoin(projectsTable, eq(invoicesTable.projectId, projectsTable.id))
      .where(eq(invoicesTable.id, localInvoiceId))
      .limit(1);

    if (invoices.length === 0) {
      return { success: false, error: "Invoice not found" };
    }

    const { invoice, coreProjectId } = invoices[0];

    if (!coreProjectId) {
      return { success: false, error: "Project not linked to Core" };
    }

    if (invoice.coreInvoiceId) {
      return { success: false, error: "Invoice already synced to Core" };
    }

    // Build Core invoice payload
    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const coreInvoice: Record<string, unknown> = {
      projectId: coreProjectId,
      invoiceDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      description: invoice.notes || `Invoice ${invoice.invoiceNumber}`,
      amount: Number(invoice.total),
      lineItems: lineItems.map((li: any) => ({
        description: li.description || "",
        quantity: Number(li.quantity || 1),
        unitPrice: Number(li.unitPrice || 0),
        amount: Number(li.quantity || 1) * Number(li.unitPrice || 0),
      })),
    };

    const created = await bqeClient.createInvoice(coreInvoice);
    const coreId = String(created.id || created.Id || "");

    if (coreId) {
      await db
        .update(invoicesTable)
        .set({ coreInvoiceId: coreId, updatedAt: new Date() })
        .where(eq(invoicesTable.id, localInvoiceId));
      return { success: true, coreInvoiceId: coreId };
    }

    return { success: false, error: "No invoice ID returned from Core" };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Sync invoice status from BQE Core back to local.
 */
export async function syncInvoiceStatusFromCore(
  bqeClient: BqeClient,
  db: any,
  localInvoiceId: string
): Promise<{ success: boolean; status?: string; error?: string }> {
  try {
    const invoices = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, localInvoiceId))
      .limit(1);

    if (invoices.length === 0) return { success: false, error: "Invoice not found" };
    if (!invoices[0].coreInvoiceId) return { success: false, error: "Invoice not linked to Core" };

    const coreInvoice = await bqeClient.getInvoice(invoices[0].coreInvoiceId);
    const coreStatus = String(coreInvoice.status || "").toLowerCase();

    // Map Core status to local status
    let localStatus: "draft" | "sent" | "paid" | "overdue" = "draft";
    if (coreStatus.includes("paid") || coreStatus.includes("closed")) localStatus = "paid";
    else if (coreStatus.includes("sent") || coreStatus.includes("open")) localStatus = "sent";
    else if (coreStatus.includes("overdue") || coreStatus.includes("past")) localStatus = "overdue";

    await db
      .update(invoicesTable)
      .set({ status: localStatus, updatedAt: new Date() })
      .where(eq(invoicesTable.id, localInvoiceId));

    return { success: true, status: localStatus };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
