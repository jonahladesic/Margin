import { Link, useLocation } from "wouter";
import { CalendarDays, FolderKanban, Users, FileText, Receipt, Settings, ChevronDown, Check } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { user, allUsers, switchUser, isSwitching, isPM, isAdmin } = useCurrentUser();

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username
    : "Loading...";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-xl font-bold tracking-tight text-sidebar-primary">RSM Design OS</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/calendar" || location === "/"}>
                  <Link href="/calendar">
                    <CalendarDays className="mr-2" />
                    <span>Calendar</span>
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
                  <SidebarMenuButton asChild isActive={location.startsWith("/invoices")}>
                    <Link href="/invoices">
                      <FileText className="mr-2" />
                      <span>Invoices</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location.startsWith("/expenses")}>
                  <Link href="/expenses">
                    <Receipt className="mr-2" />
                    <span>Expenses</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
        {import.meta.env.DEV ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 -m-2 rounded-lg hover:bg-muted/60 transition-colors text-left">
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
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Switch User (Dev Mode)
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allUsers.map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => switchUser(u.id)}
                  disabled={isSwitching}
                  className="flex items-center gap-3 py-2"
                >
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarFallback className="text-[10px] font-semibold">
                      {getInitials(u.firstName, u.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.username}
                    </span>
                    <span className={`text-[10px] ${u.role === "pm" ? "text-blue-400" : u.role === "admin" ? "text-primary" : "text-emerald-400"}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </div>
                  {user?.id === u.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-3 w-full p-2 -m-2">
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
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
