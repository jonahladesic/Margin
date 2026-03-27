import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
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

export default function Login() {
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
            Studio OS
          </h1>
          <p className="text-muted-foreground text-lg">
            Select a user to continue
          </p>
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
      </div>
    </div>
  );
}
