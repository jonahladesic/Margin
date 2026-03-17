import { Link, useLocation } from "wouter";
import { CalendarDays, FolderKanban, Users, FileText, Receipt, LogOut } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const isPM = user.role === "pm" || isAdmin;

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <h2 className="text-xl font-bold tracking-tight text-sidebar-primary">Studio OS</h2>
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
              
              {isPM && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/resources")}>
                    <Link href="/resources">
                      <Users className="mr-2" />
                      <span>Resources</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/invoices")}>
                    <Link href="/invoices">
                      <FileText className="mr-2" />
                      <span>Invoices</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {isPM && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.startsWith("/expenses")}>
                    <Link href="/expenses">
                      <Receipt className="mr-2" />
                      <span>Expenses</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.profileImage || undefined} />
            <AvatarFallback>{user.username?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">{user.username}</span>
            <span className="text-xs text-sidebar-foreground/60 uppercase">{user.role}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
