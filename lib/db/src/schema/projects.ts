import {
  pgTable,
  text,
  timestamp,
  numeric,
  date,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "partial",
  "paid",
]);

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

export const workStatusEnum = pgEnum("work_status", [
  "working_internally",
  "awaiting_client",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "lead",
  "designer",
]);

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientId: text("client_id").references(() => clientsTable.id),
  status: projectStatusEnum("status").notNull().default("active"),
  type: projectTypeEnum("type").notNull().default("other"),
  workStatus: workStatusEnum("work_status").notNull().default("working_internally"),
  budgetedHours: numeric("budgeted_hours", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  color: text("color"),
  ntpReceived: boolean("ntp_received").notNull().default(false),
  ntpDate: date("ntp_date"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectMembersTable = pgTable("project_members", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: memberRoleEnum("role").notNull().default("designer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

export const insertProjectMemberSchema = createInsertSchema(projectMembersTable).omit({
  createdAt: true,
});
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembersTable.$inferSelect;
