import crypto from "crypto";
import { eq } from "drizzle-orm";
import { projectsTable, phasesTable, invoicesTable } from "@workspace/db/schema";
import type { CoreWebhookEvent } from "./types.js";

/**
 * Validate a BQE Core webhook signature.
 * Core signs webhooks with SHA-256 HMAC.
 */
export function validateWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

/**
 * Handle an incoming webhook event from BQE Core.
 */
export async function handleWebhookEvent(
  event: CoreWebhookEvent,
  db: any
): Promise<{ handled: boolean; action?: string; error?: string }> {
  const { eventType, entityType, entityId, data } = event;

  try {
    switch (entityType.toLowerCase()) {
      case "project": {
        return handleProjectEvent(eventType, entityId, data, db);
      }
      case "activity": {
        return handleActivityEvent(eventType, entityId, data, db);
      }
      case "invoice": {
        return handleInvoiceEvent(eventType, entityId, data, db);
      }
      default:
        return { handled: false, action: `Unhandled entity type: ${entityType}` };
    }
  } catch (e: any) {
    return { handled: false, error: e.message };
  }
}

async function handleProjectEvent(
  eventType: string,
  coreProjectId: string,
  data: Record<string, unknown> | undefined,
  db: any
): Promise<{ handled: boolean; action?: string; error?: string }> {
  const existing = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.coreProjectId, coreProjectId))
    .limit(1);

  if (existing.length === 0) {
    return { handled: false, action: "Project not found locally" };
  }

  if (eventType === "update" && data) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.name) updates.name = String(data.name);
    if (data.projectNumber) updates.coreProjectNumber = String(data.projectNumber);
    if (data.status) {
      const s = String(data.status).toLowerCase();
      if (s.includes("complete")) updates.status = "completed";
      else if (s.includes("hold")) updates.status = "on_hold";
      else if (s.includes("cancel")) updates.status = "cancelled";
      else updates.status = "active";
    }
    await db
      .update(projectsTable)
      .set(updates)
      .where(eq(projectsTable.id, existing[0].id));
    return { handled: true, action: `Updated project ${existing[0].name}` };
  }

  return { handled: true, action: `Received ${eventType} for project` };
}

async function handleActivityEvent(
  eventType: string,
  coreActivityId: string,
  data: Record<string, unknown> | undefined,
  db: any
): Promise<{ handled: boolean; action?: string; error?: string }> {
  const existing = await db
    .select()
    .from(phasesTable)
    .where(eq(phasesTable.coreActivityId, coreActivityId))
    .limit(1);

  if (existing.length === 0) {
    return { handled: false, action: "Activity/phase not found locally" };
  }

  if (eventType === "update" && data) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.name) updates.name = String(data.name);
    if (data.budget !== undefined) updates.budgetedHours = String(data.budget);
    await db
      .update(phasesTable)
      .set(updates)
      .where(eq(phasesTable.id, existing[0].id));
    return { handled: true, action: `Updated phase ${existing[0].name}` };
  }

  return { handled: true, action: `Received ${eventType} for activity` };
}

async function handleInvoiceEvent(
  eventType: string,
  coreInvoiceId: string,
  data: Record<string, unknown> | undefined,
  db: any
): Promise<{ handled: boolean; action?: string; error?: string }> {
  const existing = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.coreInvoiceId, coreInvoiceId))
    .limit(1);

  if (existing.length === 0) {
    return { handled: false, action: "Invoice not found locally" };
  }

  if ((eventType === "update" || eventType === "workflow") && data) {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (data.status) {
      const s = String(data.status).toLowerCase();
      if (s.includes("paid")) updates.status = "paid";
      else if (s.includes("sent") || s.includes("open")) updates.status = "sent";
      else if (s.includes("overdue")) updates.status = "overdue";
    }
    await db
      .update(invoicesTable)
      .set(updates)
      .where(eq(invoicesTable.id, existing[0].id));
    return { handled: true, action: `Updated invoice ${existing[0].invoiceNumber}` };
  }

  if (eventType === "void") {
    // Mark as cancelled/overdue
    await db
      .update(invoicesTable)
      .set({ status: "overdue", updatedAt: new Date() })
      .where(eq(invoicesTable.id, existing[0].id));
    return { handled: true, action: `Voided invoice ${existing[0].invoiceNumber}` };
  }

  return { handled: true, action: `Received ${eventType} for invoice` };
}
