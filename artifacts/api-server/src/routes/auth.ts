import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import {
  clearSession,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

// ── Google OAuth ──
router.get("/auth/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    res.status(500).json({ error: "Google OAuth is not configured" });
    return;
  }

  const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

  // Generate CSRF state token
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 5 * 60 * 1000, // 5 minutes
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  res.redirect(authUrl);
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    res.redirect("/login?error=not_configured");
    return;
  }

  const { code, state } = req.query as Record<string, string>;
  const storedState = req.cookies?.oauth_state;

  // Clear the state cookie
  res.clearCookie("oauth_state", { path: "/" });

  // CSRF check
  if (!state || !storedState || state !== storedState) {
    res.redirect("/login?error=invalid_state");
    return;
  }

  try {
    const oauth2Client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify ID token
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      res.redirect("/login?error=no_email");
      return;
    }

    // Look up user by email
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, payload.email))
      .limit(1);

    if (!user) {
      // User not registered in the system
      res.redirect("/login?error=not_authorized");
      return;
    }

    // Update profile image from Google if not set
    if (!user.profileImage && payload.picture) {
      await db.update(usersTable)
        .set({ profileImage: payload.picture })
        .where(eq(usersTable.id, user.id));
    }

    // Create session
    const sessionData: SessionData = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImage || payload.picture || null,
      },
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    res.redirect("/");
  } catch (err: any) {
    console.error("Google OAuth error:", err.message);
    res.redirect("/login?error=auth_failed");
  }
});

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

// Login as a specific user (dev mode only in production)
router.post("/auth/login", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Dev login is disabled in production. Use Google SSO." });
    return;
  }

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

// Extension token — returns the session ID for the Chrome extension to use as Bearer token
router.get("/auth/extension-token", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const sid = getSessionId(req);
  if (!sid) {
    res.status(401).json({ error: "No session" });
    return;
  }

  // Return the session ID and user info for the extension to store
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);

  res.json({
    sid,
    user: dbUser
      ? {
          id: dbUser.id,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          email: dbUser.email,
          profileImage: dbUser.profileImage,
          role: dbUser.role,
        }
      : req.user,
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
