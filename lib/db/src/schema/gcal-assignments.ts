import { pgTable, text, timestamp, unique, real } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { phasesTable } from "./phases";

export const gcalAssignmentsTable = pgTable(
  "gcal_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => usersTable.id),
    eventKey: text("event_key").notNull(),
    projectId: text("project_id").notNull().references(() => projectsTable.id),
    phaseId: text("phase_id").references(() => phasesTable.id),
    durationHours: real("duration_hours"),
    eventTitle: text("event_title"),
    eventDate: text("event_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("gcal_assignments_user_event_unique").on(table.userId, table.eventKey),
  ]
);

export type GcalAssignment = typeof gcalAssignmentsTable.$inferSelect;
