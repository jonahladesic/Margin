import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { expensesTable, usersTable, projectsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

async function formatExpense(exp: typeof expensesTable.$inferSelect) {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, exp.userId)).limit(1);
  const project = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, exp.projectId))
    .limit(1);
  return {
    id: exp.id,
    projectId: exp.projectId,
    projectName: project[0]?.name ?? "Unknown",
    userId: exp.userId,
    userName: user[0]
      ? `${user[0].firstName ?? ""} ${user[0].lastName ?? ""}`.trim() || user[0].username
      : "Unknown",
    description: exp.description,
    amount: parseFloat(exp.amount),
    category: exp.category,
    date: exp.date,
    billable: exp.billable,
    approved: exp.approved,
    receiptUrl: exp.receiptUrl,
    createdAt: exp.createdAt.toISOString(),
  };
}

router.get("/expenses", async (req, res) => {
  const { projectId } = req.query as Record<string, string>;
  const conditions = [];
  if (projectId) conditions.push(eq(expensesTable.projectId, projectId));

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(expensesTable.date);

  const result = await Promise.all(expenses.map(formatExpense));
  res.json(result);
});

router.post("/expenses", async (req, res) => {
  const { projectId, userId, description, amount, category, date, billable, receiptUrl } = req.body;
  if (!projectId || !userId || !description || amount === undefined || !category || !date) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const newExpense = await db
    .insert(expensesTable)
    .values({
      id: randomUUID(),
      projectId,
      userId,
      description,
      amount: String(amount),
      category,
      date,
      billable: billable ?? true,
      approved: false,
      receiptUrl: receiptUrl || null,
    })
    .returning();

  res.status(201).json(await formatExpense(newExpense[0]));
});

router.put("/expenses/:id", async (req, res) => {
  const { description, amount, category, date, billable, approved, receiptUrl } = req.body;
  const updated = await db
    .update(expensesTable)
    .set({
      description,
      amount: amount !== undefined ? String(amount) : undefined,
      category,
      date,
      billable,
      approved,
      receiptUrl,
      updatedAt: new Date(),
    })
    .where(eq(expensesTable.id, req.params.id))
    .returning();

  if (!updated[0]) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(await formatExpense(updated[0]));
});

router.delete("/expenses/:id", async (req, res) => {
  await db.delete(expensesTable).where(eq(expensesTable.id, req.params.id));
  res.status(204).send();
});

export default router;
