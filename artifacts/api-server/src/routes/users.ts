import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

const router: IRouter = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
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
  };
}

// In-memory active user ID for dev-mode switching (defaults to admin)
let activeUserId: string = "user-admin-001";

router.get("/users", async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(formatUser));
});

router.get("/users/:id", async (req, res) => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);
  if (!user[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user[0]));
});

// Dev-mode: get currently active user (bypasses OIDC auth)
router.get("/current-user", async (_req, res) => {
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, activeUserId))
    .limit(1);
  if (!user[0]) {
    // Fallback to first user
    const fallback = await db.select().from(usersTable).limit(1);
    if (fallback[0]) {
      activeUserId = fallback[0].id;
      res.json(formatUser(fallback[0]));
      return;
    }
    res.status(404).json({ error: "No users found" });
    return;
  }
  res.json(formatUser(user[0]));
});

// Dev-mode: switch active user
router.post("/dev/switch-user", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  const user = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  activeUserId = userId;
  console.log(`[dev] Switched to user: ${user[0].firstName} ${user[0].lastName} (${user[0].role})`);
  res.json(formatUser(user[0]));
});

// Update user role
router.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body;
  if (!["designer", "pm", "admin"].includes(role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }
  const updated = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(usersTable.id, req.params.id))
    .returning();
  if (!updated[0]) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(updated[0]));
});

export default router;
