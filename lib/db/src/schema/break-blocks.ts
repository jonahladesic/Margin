import { pgTable, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const breakBlocksTable = pgTable("break_blocks", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  date: date("date").notNull(),
  startTime: numeric("start_time", { precision: 5, scale: 2 }).notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  label: text("label").notNull().default("Break"),
  color: text("color").default("#6b7280"),
  recurrenceRule: text("recurrence_rule"),
  seriesId: text("series_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBreakBlockSchema = createInsertSchema(breakBlocksTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBreakBlock = z.infer<typeof insertBreakBlockSchema>;
export type BreakBlock = typeof breakBlocksTable.$inferSelect;
