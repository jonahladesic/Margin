import { pgTable, text, timestamp, numeric, date, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { phasesTable } from "./phases";
import { allocationsTable } from "./allocations";

export const timeBlockTypeEnum = pgEnum("time_block_type", [
  "work",
  "meeting",
  "kickoff",
  "deadline",
  "page_turn",
]);

export const timeBlocksTable = pgTable("time_blocks", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  projectId: text("project_id").notNull().references(() => projectsTable.id),
  phaseId: text("phase_id").references(() => phasesTable.id),
  allocationId: text("allocation_id").references(() => allocationsTable.id),
  date: date("date").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  type: timeBlockTypeEnum("type").notNull().default("work"),
  title: text("title"),
  subPhase: text("sub_phase"),
  description: text("description"),
  startTime: numeric("start_time", { precision: 5, scale: 2 }),
  approved: boolean("approved").notNull().default(false),
  recurrenceRule: text("recurrence_rule"),
  seriesId: text("series_id"),
  meetingId: text("meeting_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTimeBlockSchema = createInsertSchema(timeBlocksTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertTimeBlock = z.infer<typeof insertTimeBlockSchema>;
export type TimeBlock = typeof timeBlocksTable.$inferSelect;
