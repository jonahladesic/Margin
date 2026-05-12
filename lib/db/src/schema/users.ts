import { pgTable, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["designer", "pm", "admin"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  replitId: text("replit_id").notNull().unique(),
  username: text("username").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  profileImage: text("profile_image"),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("designer"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
