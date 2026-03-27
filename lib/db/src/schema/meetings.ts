import { pgTable, text, timestamp, date, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "cancelled",
  "completed",
]);

export const meetingsTable = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  organizerId: text("organizer_id").notNull().references(() => usersTable.id),
  date: date("date").notNull(),
  startTime: numeric("start_time", { precision: 5, scale: 2 }).notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
  zoomLink: text("zoom_link"),
  status: meetingStatusEnum("status").notNull().default("scheduled"),
  recurrenceRule: text("recurrence_rule"),
  seriesId: text("series_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const meetingAttendeesTable = pgTable("meeting_attendees", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull().references(() => meetingsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  timeBlockId: text("time_block_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
