import {
  pgTable,
  text,
  timestamp,
  numeric,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "on_hold",
  "completed",
  "cancelled",
]);

export const projectTypeEnum = pgEnum("project_type", [
  "branding",
  "web",
  "interior",
  "architecture",
  "other",
]);

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientId: text("client_id").references(() => clientsTable.id),
  status: projectStatusEnum("status").notNull().default("active"),
  type: projectTypeEnum("type").notNull().default("other"),
  budgetedHours: numeric("budgeted_hours", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  color: text("color"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
