import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

// Get current authenticated user
router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const dbUsers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);
  const dbUser = dbUsers[0];
  res.json({
    authenticated: true,
    user: dbUser
      ? {
          id: dbUser.id,
          replitId: dbUser.replitId,
          username: dbUser.username,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          email: dbUser.email,
          profileImage: dbUser.profileImage,
          role: dbUser.role,
          hourlyRate: dbUser.hourlyRate ? parseFloat(dbUser.hourlyRate) : null,
          createdAt: dbUser.createdAt.toISOString(),
        }
      : req.user,
  });
});

// List all users (for login picker)
router.get("/auth/users", async (_req: Request, res: Response) => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      profileImage: u.profileImage,
      role: u.role,
    })),
  );
});

// Login as a specific user
router.post("/auth/login", async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const sessionData: SessionData = {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImage,
    },
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      replitId: user.replitId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profileImage: user.profileImage,
      role: user.role,
      hourlyRate: user.hourlyRate ? parseFloat(user.hourlyRate) : null,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

// Logout
router.post("/auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

// Keep GET /logout for backwards compat (redirects to login page)
router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/login");
});

export default router;
