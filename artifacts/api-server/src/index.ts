import app from "./app";
import { seedRSMInternal, seedTestUsers } from "./seed";

// Prevent Neon idle-disconnect or transient DB errors from crashing the server
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection (non-fatal):", reason);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  Promise.all([
    seedRSMInternal(),
    seedTestUsers(),
  ]).catch((err) => console.error("Seed error:", err));
});
