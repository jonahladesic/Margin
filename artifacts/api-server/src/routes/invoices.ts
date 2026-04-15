import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, projectsTable, clientsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function generateInvoiceNumber() {
  const now = new Date();
  return `INV-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function formatInvoice(inv: typeof invoicesTable.$inferSelect) {
  const project = await db
    .select({ project: projectsTable, clientName: clientsTable.name })
    .from(projectsTable)
    .leftJoin(clientsTable, eq(projectsTable.clientId, clientsTable.id))
    .where(eq(projectsTable.id, inv.projectId))
    .limit(1);

  const lineItems = Array.isArray(inv.lineItems)
    ? (inv.lineItems as Array<{ description: string; quantity: number; unitPrice: number }>).map(
        (li, i) => ({
          id: String(i),
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.quantity * li.unitPrice,
        })
      )
    : [];

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    projectId: inv.projectId,
    projectName: project[0]?.project.name ?? "Unknown",
    clientId: project[0]?.project.clientId ?? null,
    clientName: project[0]?.clientName ?? null,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    subtotal: parseFloat(inv.subtotal),
    taxRate: parseFloat(inv.taxRate),
    taxAmount: parseFloat(inv.taxAmount),
    total: parseFloat(inv.total),
    notes: inv.notes,
    lineItems,
    coreInvoiceId: inv.coreInvoiceId,
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/invoices", async (req, res) => {
  const { projectId, status } = req.query as Record<string, string>;
  const conditions = [];
  if (projectId) conditions.push(eq(invoicesTable.projectId, projectId));
  if (status) conditions.push(eq(invoicesTable.status, status as typeof invoicesTable.$inferSelect["status"]));

  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(invoicesTable.issueDate);

  const result = await Promise.all(invoices.map(formatInvoice));
  res.json(result);
});

router.get("/invoices/:id", async (req, res) => {
  const invoice = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, req.params.id))
    .limit(1);
  if (!invoice[0]) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(await formatInvoice(invoice[0]));
});

router.post("/invoices", async (req, res) => {
  const { projectId, issueDate, dueDate, taxRate, notes, lineItems } = req.body;
  if (!projectId || !issueDate || !dueDate || !lineItems) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const items = lineItems as Array<{ description: string; quantity: number; unitPrice: number }>;
  const subtotal = items.reduce((sum: number, li) => sum + li.quantity * li.unitPrice, 0);
  const tax = (taxRate ?? 0) / 100;
  const taxAmount = subtotal * tax;
  const total = subtotal + taxAmount;

  const newInvoice = await db
    .insert(invoicesTable)
    .values({
      id: randomUUID(),
      invoiceNumber: generateInvoiceNumber(),
      projectId,
      status: "draft",
      issueDate,
      dueDate,
      subtotal: String(subtotal),
      taxRate: String(taxRate ?? 0),
      taxAmount: String(taxAmount),
      total: String(total),
      notes: notes || null,
      lineItems: items,
    })
    .returning();

  res.status(201).json(await formatInvoice(newInvoice[0]));
});

router.put("/invoices/:id", async (req, res) => {
  const { status, issueDate, dueDate, taxRate, notes, lineItems } = req.body;

  let subtotal: string | undefined;
  let taxAmount: string | undefined;
  let total: string | undefined;

  if (lineItems) {
    const items = lineItems as Array<{ description: string; quantity: number; unitPrice: number }>;
    const sub = items.reduce((sum: number, li) => sum + li.quantity * li.unitPrice, 0);
    const tax = (taxRate ?? 0) / 100;
    subtotal = String(sub);
    taxAmount = String(sub * tax);
    total = String(sub + sub * tax);
  }

  const updated = await db
    .update(invoicesTable)
    .set({
      status,
      issueDate,
      dueDate,
      taxRate: taxRate !== undefined ? String(taxRate) : undefined,
      notes,
      lineItems: lineItems ?? undefined,
      subtotal,
      taxAmount,
      total,
      updatedAt: new Date(),
    })
    .where(eq(invoicesTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(await formatInvoice(updated[0]));
});

export default router;
