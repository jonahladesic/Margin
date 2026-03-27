import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon serverless Postgres closes idle connections aggressively.
  // Keep the pool resilient by limiting idle time and retrying.
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  max: 5,
});

// Prevent unhandled pool errors from crashing the process
pool.on("error", (err) => {
  console.error("[db] Pool connection error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
