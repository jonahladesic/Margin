import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const syncEntityTypeEnum = pgEnum("sync_entity_type", [
  "project",
  "phase",
  "timeblock",
  "invoice",
  "client",
  "expense",
]);

export const syncDirectionEnum = pgEnum("sync_direction", [
  "inbound",
  "outbound",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "success",
  "error",
]);

export const syncLogTable = pgTable("sync_log", {
  id: text("id").primaryKey(),
  entityType: syncEntityTypeEnum("entity_type").notNull(),
  entityId: text("entity_id"),
  direction: syncDirectionEnum("direction").notNull(),
  status: syncStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  details: text("details"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const insertSyncLogSchema = createInsertSchema(syncLogTable);
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogTable.$inferSelect;
