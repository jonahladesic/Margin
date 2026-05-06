import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, projectsTable, clientsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { jsPDF } from "jspdf";

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

// ── PDF generation ──
router.get("/invoices/:id/pdf", async (req, res) => {
  const invoice = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, req.params.id))
    .limit(1);
  if (!invoice[0]) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  const inv = invoice[0];
  const formatted = await formatInvoice(inv);

  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("INVOICE", 20, y);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(formatted.invoiceNumber, 20, y + 8);
  doc.setTextColor(0);

  // Status badge
  doc.setFontSize(11);
  doc.text(formatted.status.toUpperCase(), pageW - 20, y, { align: "right" });
  y += 20;

  // Project & Client info
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Project:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatted.projectName, 55, y);
  y += 6;
  if (formatted.clientName) {
    doc.setFont("helvetica", "bold");
    doc.text("Client:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(formatted.clientName, 55, y);
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Issue Date:", 20, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatted.issueDate, 55, y);
  doc.setFont("helvetica", "bold");
  doc.text("Due Date:", 110, y);
  doc.setFont("helvetica", "normal");
  doc.text(formatted.dueDate, 140, y);
  y += 12;

  // Line items table header
  doc.setFillColor(245, 245, 245);
  doc.rect(20, y - 4, pageW - 40, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Description", 22, y);
  doc.text("Qty", 120, y, { align: "right" });
  doc.text("Unit Price", 150, y, { align: "right" });
  doc.text("Amount", pageW - 22, y, { align: "right" });
  y += 8;

  // Line items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const li of formatted.lineItems) {
    doc.text(li.description || "", 22, y);
    doc.text(String(li.quantity), 120, y, { align: "right" });
    doc.text(`$${li.unitPrice.toFixed(2)}`, 150, y, { align: "right" });
    doc.text(`$${li.amount.toFixed(2)}`, pageW - 22, y, { align: "right" });
    y += 6;
  }

  // Divider
  y += 4;
  doc.setDrawColor(200);
  doc.line(110, y, pageW - 20, y);
  y += 8;

  // Totals
  doc.setFontSize(10);
  doc.text("Subtotal", 120, y);
  doc.text(`$${formatted.subtotal.toFixed(2)}`, pageW - 22, y, { align: "right" });
  y += 6;
  if (formatted.taxRate > 0) {
    doc.text(`Tax (${formatted.taxRate}%)`, 120, y);
    doc.text(`$${formatted.taxAmount.toFixed(2)}`, pageW - 22, y, { align: "right" });
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", 120, y);
  doc.text(`$${formatted.total.toFixed(2)}`, pageW - 22, y, { align: "right" });

  // Notes
  if (formatted.notes) {
    y += 14;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 20, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    const lines = doc.splitTextToSize(formatted.notes, pageW - 40);
    doc.text(lines, 20, y);
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${formatted.invoiceNumber}.pdf"`);
  res.send(pdfBuffer);
});

router.delete("/invoices/:id", async (req, res) => {
  await db.delete(invoicesTable).where(eq(invoicesTable.id, req.params.id));
  res.status(204).send();
});

export default router;
