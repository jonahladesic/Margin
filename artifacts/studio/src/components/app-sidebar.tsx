import { Link, useLocation } from "wouter";
import { LayoutDashboard, FolderKanban, Users, Settings, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/contexts/auth-context";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  pm: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  designer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "Project Manager",
  designer: "Designer",
};

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.[0] ?? "";
  const l = lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isPM, isAdmin, logout } = useCurrentUser();

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username
    : "Loading...";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-xl font-bold tracking-tight text-sidebar-primary">Margin</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/dashboard" || location === "/"}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="mr-2" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/projects")}>
                  <Link href="/projects">
                    <FolderKanban className="mr-2" />
                    <span>Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {(isPM || isAdmin) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/resources")}>
                    <Link href="/resources">
                      <Users className="mr-2" />
                      <span>Resources</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {(isPM || isAdmin) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/settings")}>
                    <Link href="/settings">
                      <Settings className="mr-2" />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3 w-full">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback className="text-xs font-semibold">
              {user ? getInitials(user.firstName, user.lastName) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <Badge
              variant="outline"
              className={`w-fit text-[10px] mt-0.5 px-1.5 py-0 border ${ROLE_COLORS[user?.role ?? "designer"]}`}
            >
              {ROLE_LABELS[user?.role ?? "designer"]}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={logout}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
