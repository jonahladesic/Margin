import { pgTable, text, timestamp, numeric, date, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const expenseCategoryEnum = pgEnum("expense_category", [
  "travel",
  "supplies",
  "software",
  "meals",
  "other",
]);

export const expensesTable = pgTable("expenses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projectsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: expenseCategoryEnum("category").notNull().default("other"),
  date: date("date").notNull(),
  billable: boolean("billable").notNull().default(true),
  approved: boolean("approved").notNull().default(false),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;
