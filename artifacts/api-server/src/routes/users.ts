import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/users", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(
    users.map((u) => ({
      id: u.id,
      replitId: u.replitId,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      profileImage: u.profileImage,
      role: u.role,
      hourlyRate: u.hourlyRate ? parseFloat(u.hourlyRate) : null,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

router.get("/users/:id", async (req, res) => {
  const { eq } = await import("drizzle-orm");
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);
  if (!user[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const u = user[0];
  res.json({
    id: u.id,
    replitId: u.replitId,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    profileImage: u.profileImage,
    role: u.role,
    hourlyRate: u.hourlyRate ? parseFloat(u.hourlyRate) : null,
    createdAt: u.createdAt.toISOString(),
  });
});

export default router;
