import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db/schema";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.get("/clients", async (_req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json(
    clients.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.get("/clients/:id", async (req, res) => {
  const { eq } = await import("drizzle-orm");
  const client = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, req.params.id))
    .limit(1);
  if (!client[0]) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const c = client[0];
  res.json({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    createdAt: c.createdAt.toISOString(),
  });
});

router.post("/clients", async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const newClient = await db
    .insert(clientsTable)
    .values({ id: randomUUID(), name, email, phone, address })
    .returning();
  const c = newClient[0];
  res.status(201).json({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    createdAt: c.createdAt.toISOString(),
  });
});

router.put("/clients/:id", async (req, res) => {
  const { eq } = await import("drizzle-orm");
  const { name, email, phone, address } = req.body;
  const updated = await db
    .update(clientsTable)
    .set({ name, email, phone, address, updatedAt: new Date() })
    .where(eq(clientsTable.id, req.params.id))
    .returning();
  if (!updated[0]) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const c = updated[0];
  res.json({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    address: c.address,
    createdAt: c.createdAt.toISOString(),
  });
});

export default router;
