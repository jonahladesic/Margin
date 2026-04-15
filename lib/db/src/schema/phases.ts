import { pgTable, text, timestamp, numeric, date, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const phaseStatusEnum = pgEnum("phase_status", [
  "upcoming",
  "in_progress",
  "completed",
]);

export const phasesTable = pgTable("phases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projectsTable.id),
  name: text("name").notNull(),
  budgetedHours: numeric("budgeted_hours", { precision: 10, scale: 2 }).notNull().default("0"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: phaseStatusEnum("status").notNull().default("upcoming"),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: numeric("sort_order", { precision: 5, scale: 0 }).notNull().default("0"),
  kickoffDate: date("kickoff_date"),
  deadlineDate: date("deadline_date"),
  pageTurnDate: date("page_turn_date"),
  coreActivityId: text("core_activity_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPhaseSchema = createInsertSchema(phasesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPhase = z.infer<typeof insertPhaseSchema>;
export type Phase = typeof phasesTable.$inferSelect;
