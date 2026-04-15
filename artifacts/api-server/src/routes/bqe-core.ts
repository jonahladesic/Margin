import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { bqeTokensTable, syncLogTable, projectsTable } from "@workspace/db/schema";
import {
  BqeClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  extractBaseUrl,
  validateWebhookSignature,
  handleWebhookEvent,
  syncClientsFromCore,
  syncProjectsFromCore,
  syncAllPhasesFromCore,
  syncPhasesFromCore,
  pushTimeEntriesToCore,
  pushSingleTimeEntry,
  pushInvoiceToCore,
  syncInvoiceStatusFromCore,
  type BqeAuthConfig,
} from "@workspace/bqe-core";

const router: IRouter = Router();

// --- Helper: get auth config from env ---
function getAuthConfig(): BqeAuthConfig {
  const clientId = process.env.BQE_CLIENT_ID;
  const clientSecret = process.env.BQE_CLIENT_SECRET;
  const redirectUri = process.env.BQE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("BQE_CLIENT_ID, BQE_CLIENT_SECRET, and BQE_REDIRECT_URI must be set");
  }
  return { clientId, clientSecret, redirectUri };
}

// --- Helper: get or create BQE client from stored tokens ---
async function getBqeClient(): Promise<BqeClient | null> {
  const tokens = await db.select().from(bqeTokensTable).limit(1);
  if (tokens.length === 0) return null;

  const token = tokens[0];
  const authConfig = getAuthConfig();

  return new BqeClient({
    baseUrl: token.baseUrl,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: token.expiresAt,
    authConfig,
    onTokenRefresh: async (newAccess, newRefresh, newExpires, newBaseUrl) => {
      await db
        .update(bqeTokensTable)
        .set({
          accessToken: newAccess,
          refreshToken: newRefresh,
          expiresAt: newExpires,
          baseUrl: newBaseUrl,
          updatedAt: new Date(),
        })
        .where(eq(bqeTokensTable.id, token.id));
    },
  });
}

// --- Helper: log sync operations ---
async function logSync(
  entityType: "project" | "phase" | "timeblock" | "invoice" | "client" | "expense",
  entityId: string | null,
  direction: "inbound" | "outbound",
  status: "success" | "error",
  details?: string,
  errorMessage?: string
) {
  await db.insert(syncLogTable).values({
    id: randomUUID(),
    entityType,
    entityId,
    direction,
    status,
    details,
    errorMessage,
  });
}

// ============================================================
// OAuth Endpoints
// ============================================================

router.get("/bqe/auth/url", async (_req, res) => {
  try {
    const config = getAuthConfig();
    const state = randomUUID();
    const url = getAuthorizationUrl(config, state);
    res.json({ url, state });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/bqe/auth/callback", async (req, res) => {
  try {
    const { code } = req.query as { code?: string };
    if (!code) {
      res.status(400).json({ error: "Missing authorization code" });
      return;
    }

    const config = getAuthConfig();
    const tokenResponse = await exchangeCodeForTokens(config, code);
    const baseUrl = extractBaseUrl(tokenResponse);
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

    // Remove any existing tokens (single-tenant for now)
    await db.delete(bqeTokensTable);

    // Store new tokens
    await db.insert(bqeTokensTable).values({
      id: randomUUID(),
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt,
      baseUrl,
    });

    // Redirect back to the settings page
    const appUrl = process.env.NODE_ENV === "production" ? "/" : "http://localhost:5173/";
    res.redirect(`${appUrl}settings?bqe=connected`);
  } catch (e: any) {
    res.status(500).json({ error: `OAuth callback failed: ${e.message}` });
  }
});

router.get("/bqe/auth/status", async (_req, res) => {
  const tokens = await db.select().from(bqeTokensTable).limit(1);
  if (tokens.length === 0) {
    res.json({ connected: false });
    return;
  }
  const token = tokens[0];
  res.json({
    connected: true,
    companyId: token.coreCompanyId,
    companyName: token.coreCompanyName,
    expiresAt: token.expiresAt.toISOString(),
    connectedAt: token.createdAt.toISOString(),
  });
});

router.post("/bqe/auth/disconnect", async (_req, res) => {
  await db.delete(bqeTokensTable);
  res.json({ success: true });
});

// ============================================================
// Sync Endpoints
// ============================================================

router.post("/bqe/sync/clients", async (_req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await syncClientsFromCore(client, db, () => randomUUID());
  await logSync("client", null, "inbound", result.errors > 0 ? "error" : "success",
    `Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors}`);
  res.json(result);
});

router.post("/bqe/sync/projects", async (_req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await syncProjectsFromCore(client, db, () => randomUUID());
  await logSync("project", null, "inbound", result.errors > 0 ? "error" : "success",
    `Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors}`);
  res.json(result);
});

router.post("/bqe/sync/phases/:projectId", async (req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await syncPhasesFromCore(client, db, req.params.projectId, () => randomUUID());
  await logSync("phase", req.params.projectId, "inbound", result.errors > 0 ? "error" : "success",
    `Created: ${result.created}, Updated: ${result.updated}, Errors: ${result.errors}`);
  res.json(result);
});

router.post("/bqe/sync/all", async (_req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const results: Record<string, any> = {};

  // 1. Sync clients
  results.clients = await syncClientsFromCore(client, db, () => randomUUID());
  await logSync("client", null, "inbound", results.clients.errors > 0 ? "error" : "success",
    `Created: ${results.clients.created}, Updated: ${results.clients.updated}`);

  // 2. Sync projects
  results.projects = await syncProjectsFromCore(client, db, () => randomUUID());
  await logSync("project", null, "inbound", results.projects.errors > 0 ? "error" : "success",
    `Created: ${results.projects.created}, Updated: ${results.projects.updated}`);

  // 3. Sync phases for all linked projects
  results.phases = await syncAllPhasesFromCore(client, db, () => randomUUID());
  await logSync("phase", null, "inbound", results.phases.errors > 0 ? "error" : "success",
    `Created: ${results.phases.created}, Updated: ${results.phases.updated}`);

  res.json(results);
});

router.get("/bqe/sync/status", async (_req, res) => {
  const recentLogs = await db
    .select()
    .from(syncLogTable)
    .orderBy(desc(syncLogTable.syncedAt))
    .limit(20);

  const tokens = await db.select().from(bqeTokensTable).limit(1);

  res.json({
    connected: tokens.length > 0,
    recentSync: recentLogs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      direction: log.direction,
      status: log.status,
      details: log.details,
      errorMessage: log.errorMessage,
      syncedAt: log.syncedAt.toISOString(),
    })),
  });
});

// ============================================================
// Time Entry Push
// ============================================================

router.post("/bqe/time-entries/push", async (_req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await pushTimeEntriesToCore(client, db);
  await logSync("timeblock", null, "outbound", result.errors > 0 ? "error" : "success",
    `Pushed: ${result.created}, Errors: ${result.errors}`);
  res.json(result);
});

router.post("/bqe/time-entries/push/:id", async (req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await pushSingleTimeEntry(client, db, req.params.id);
  await logSync("timeblock", req.params.id, "outbound", result.success ? "success" : "error",
    result.success ? `Pushed to Core: ${result.coreId}` : undefined,
    result.error);
  res.json(result);
});

// ============================================================
// Invoice Integration
// ============================================================

router.post("/bqe/invoices/create", async (req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const { invoiceId } = req.body;
  if (!invoiceId) {
    res.status(400).json({ error: "invoiceId is required" });
    return;
  }

  const result = await pushInvoiceToCore(client, db, invoiceId);
  await logSync("invoice", invoiceId, "outbound", result.success ? "success" : "error",
    result.success ? `Created in Core: ${result.coreInvoiceId}` : undefined,
    result.error);
  res.json(result);
});

router.get("/bqe/invoices/sync/:id", async (req, res) => {
  const client = await getBqeClient();
  if (!client) {
    res.status(400).json({ error: "BQE Core not connected" });
    return;
  }

  const result = await syncInvoiceStatusFromCore(client, db, req.params.id);
  if (result.success) {
    await logSync("invoice", req.params.id, "inbound", "success",
      `Status synced: ${result.status}`);
  }
  res.json(result);
});

// ============================================================
// Webhook Receiver
// ============================================================

router.post("/bqe/webhooks", async (req, res) => {
  const webhookSecret = process.env.BQE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  // Validate signature
  const signature = req.headers["x-bqe-signature"] as string;
  if (!signature) {
    res.status(401).json({ error: "Missing webhook signature" });
    return;
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  const isValid = validateWebhookSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  // Parse and handle the event
  const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const result = await handleWebhookEvent(event, db);

  const entityType = (event.entityType || "project").toLowerCase();
  await logSync(
    entityType as any,
    event.entityId,
    "inbound",
    result.handled ? "success" : "error",
    result.action,
    result.error
  );

  res.json({ received: true, ...result });
});

export default router;
