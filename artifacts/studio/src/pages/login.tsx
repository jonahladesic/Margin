import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, Shield, Palette } from "lucide-react";

interface LoginUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  profileImage: string | null;
  role: string;
}

const roleConfig: Record<string, { label: string; color: string; icon: typeof User }> = {
  admin: { label: "Admin", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: Shield },
  pm: { label: "Project Manager", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: User },
  designer: { label: "Designer", color: "bg-violet-500/20 text-violet-400 border-violet-500/30", icon: Palette },
};

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "Your email is not registered in the system. Contact an admin to get access.",
  auth_failed: "Google authentication failed. Please try again.",
  invalid_state: "Security check failed. Please try again.",
  no_email: "Could not retrieve your email from Google.",
  not_configured: "Google SSO is not configured yet.",
};

const IS_PROD = import.meta.env.PROD;

export default function Login() {
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const errorParam = params.get("error");

  useEffect(() => {
    if (!IS_PROD) {
      fetch("/api/auth/users")
        .then((r) => r.json())
        .then((data) => {
          setUsers(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function handleLogin(userId: string) {
    setLoggingIn(userId);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setLocation("/");
        window.location.reload();
      }
    } catch {
      setLoggingIn(null);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
      <div className="w-full max-w-lg p-8">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
            Margin
          </h1>
          <p className="text-muted-foreground text-lg">
            {IS_PROD ? "Sign in to continue" : "Select a user to continue"}
          </p>
        </div>

        {/* Error message from OAuth redirect */}
        {errorParam && ERROR_MESSAGES[errorParam] && (
          <div className="mb-6 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {ERROR_MESSAGES[errorParam]}
          </div>
        )}

        {/* Google SSO button */}
        <div className="mb-6">
          <Button
            size="lg"
            className="w-full h-12 text-base gap-3"
            onClick={() => { window.location.href = "/api/auth/google"; }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fillOpacity=".7"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fillOpacity=".5"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fillOpacity=".8"/>
            </svg>
            Sign in with Google
          </Button>
        </div>

        {/* Dev mode user picker */}
        {!IS_PROD && (
          <>
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or select a dev user
                </span>
              </div>
            </div>

            {loading ? (
              <div className="text-center text-muted-foreground">Loading users...</div>
            ) : (
              <div className="grid gap-3">
                {users.map((user) => {
                  const role = roleConfig[user.role] || roleConfig.designer;
                  const Icon = role.icon;
                  const isLoggingIn = loggingIn === user.id;

                  return (
                    <button
                      key={user.id}
                      onClick={() => handleLogin(user.id)}
                      disabled={!!loggingIn}
                      className="flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left disabled:opacity-50 cursor-pointer"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`${role.color} text-xs shrink-0`}
                      >
                        {role.label}
                      </Badge>
                      {isLoggingIn && (
                        <div className="h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
