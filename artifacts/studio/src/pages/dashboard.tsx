import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FolderKanban, Clock, Users } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, isAdmin, isPM } = useCurrentUser();

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["/api/allocations", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/allocations?weekStart=${weekStartStr}&weekEnd=${weekEndStr}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch GCal hours for the current user
  const { data: gcalHours } = useQuery({
    queryKey: ["/api/gcal/hours", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/gcal/hours?startDate=${weekStartStr}&endDate=${weekEndStr}`);
      if (!res.ok) return { totalHours: 0, byProject: {} };
      return res.json();
    },
  });

  const { data: utilization = [] } = useQuery({
    queryKey: ["/api/utilization", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/utilization?weekStart=${weekStartStr}&weekEnd=${weekEndStr}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin || isPM,
  });

  const activeProjects = (projects as any[]).filter(
    (p: any) => p.status === "active" || !p.status
  );

  // My allocations this week
  const myAllocations = (allocations as any[]).filter(
    (a: any) => a.userId === user?.id
  );
  const myAllocatedHours = myAllocations.reduce(
    (sum: number, a: any) => sum + (parseFloat(a.allocatedHours) || 0),
    0
  );
  // Logged hours = manual timeblock hours + GCal assignment hours
  const myTimeblockHours = myAllocations.reduce(
    (sum: number, a: any) => sum + (parseFloat(a.loggedHours) || 0),
    0
  );
  const myGcalHours = gcalHours?.totalHours || 0;
  const myLoggedHours = myTimeblockHours + myGcalHours;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">
          Week of {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
        </p>
      </div>

      {/* This Week Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Allocated</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myAllocatedHours}h</div>
            <p className="text-xs text-muted-foreground">this week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Logged</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myLoggedHours}h</div>
            <p className="text-xs text-muted-foreground">
              {myAllocatedHours > 0
                ? `${Math.round((myLoggedHours / myAllocatedHours) * 100)}% of allocated`
                : "no allocations"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects.length}</div>
            <p className="text-xs text-muted-foreground">across the team</p>
          </CardContent>
        </Card>
      </div>

      {/* My Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeProjects.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No active projects.{" "}
              <Link href="/projects" className="text-primary underline">
                Create one
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {activeProjects.map((project: any) => {
                const budgeted = parseFloat(project.budgetedHours) || 0;
                const logged = parseFloat(project.loggedHours) || 0;
                const pct = budgeted > 0 ? Math.min((logged / budgeted) * 100, 100) : 0;

                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: project.color || "#6b7280" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{project.name}</div>
                      {budgeted > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {logged}h / {budgeted}h
                          </span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {project.status || "active"}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Activity (admin/PM only) */}
      {(isAdmin || isPM) && (utilization as any[]).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(utilization as any[]).map((u: any) => {
                const allocated = parseFloat(u.allocatedHours) || 0;
                const target = parseFloat(u.targetHours) || 40;
                const pct = Math.min((allocated / target) * 100, 100);
                const color =
                  pct > 100
                    ? "bg-destructive"
                    : pct >= 80
                    ? "bg-emerald-500"
                    : pct >= 50
                    ? "bg-amber-500"
                    : "bg-muted-foreground/30";

                return (
                  <div key={u.userId} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-32 truncate">
                      {u.firstName} {u.lastName?.[0]}.
                    </span>
                    <Progress
                      value={pct}
                      className="h-2 flex-1"
                      indicatorClassName={color}
                    />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {allocated}h / {target}h
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
