import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bqeTokensTable = pgTable("bqe_tokens", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  baseUrl: text("base_url").notNull(),
  coreCompanyId: text("core_company_id"),
  coreCompanyName: text("core_company_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBqeTokenSchema = createInsertSchema(bqeTokensTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertBqeToken = z.infer<typeof insertBqeTokenSchema>;
export type BqeToken = typeof bqeTokensTable.$inferSelect;
