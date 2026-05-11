import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Link2, Unlink, CheckCircle2, XCircle, AlertCircle,
  ArrowDownToLine, ArrowUpFromLine, Clock, Loader2,
  Users, UserPlus, Trash2, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useCurrentUser } from "@/contexts/auth-context";

const API_BASE = "/api";

function api(path: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

// ── Connection status ──
function useBqeStatus() {
  return useQuery({
    queryKey: ["bqe-status"],
    queryFn: () => api("/bqe/auth/status"),
    refetchInterval: 30_000,
  });
}

// ── Sync status & log ──
function useSyncStatus() {
  return useQuery({
    queryKey: ["bqe-sync-status"],
    queryFn: () => api("/bqe/sync/status"),
    refetchInterval: 10_000,
  });
}

const ROLE_OPTIONS = [
  { value: "designer", label: "Designer" },
  { value: "pm", label: "Project Manager" },
  { value: "admin", label: "Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary/20 text-primary border-primary/30",
  pm: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  designer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.[0] ?? "";
  const l = lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser, isPM, isAdmin } = useCurrentUser();
  const { data: bqeStatus, isLoading: statusLoading } = useBqeStatus();
  const { data: syncStatus } = useSyncStatus();
  const [syncing, setSyncing] = useState(false);

  // Team management state
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({ email: "", firstName: "", lastName: "", role: "designer" });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api("/users"),
  });

  const createMember = useMutation({
    mutationFn: (data: any) => api("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Team member added" });
      setAddMemberOpen(false);
      setMemberForm({ email: "", firstName: "", lastName: "", role: "designer" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMember = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Team member updated" });
      setEditMemberId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMember = useMutation({
    mutationFn: (id: string) => api(`/users/${id}`, { method: "DELETE" }).catch(() => null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Team member removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function openAddMember() {
    setMemberForm({ email: "", firstName: "", lastName: "", role: "designer" });
    setAddMemberOpen(true);
  }

  function openEditMember(member: any) {
    setMemberForm({
      email: member.email || "",
      firstName: member.firstName || "",
      lastName: member.lastName || "",
      role: member.role || "designer",
    });
    setEditMemberId(member.id);
  }

  const connected = bqeStatus?.connected === true;

  // ── Connect to BQE ──
  const connectMutation = useMutation({
    mutationFn: async () => {
      const data = await api("/bqe/auth/url");
      // Open BQE login in new window
      window.open(data.url, "_blank", "width=600,height=700");
      return data;
    },
    onSuccess: () => {
      toast({ title: "BQE Core", description: "Authorization window opened. Complete login to connect." });
      // Poll for connection status
      const interval = setInterval(async () => {
        const status = await api("/bqe/auth/status");
        if (status.connected) {
          clearInterval(interval);
          queryClient.invalidateQueries({ queryKey: ["bqe-status"] });
          queryClient.invalidateQueries({ queryKey: ["bqe-sync-status"] });
          toast({ title: "Connected!", description: "BQE Core is now connected." });
        }
      }, 3000);
      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(interval), 300_000);
    },
    onError: (e: Error) => {
      toast({ title: "Connection Failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Disconnect ──
  const disconnectMutation = useMutation({
    mutationFn: () => api("/bqe/auth/disconnect", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bqe-status"] });
      queryClient.invalidateQueries({ queryKey: ["bqe-sync-status"] });
      toast({ title: "Disconnected", description: "BQE Core has been disconnected." });
    },
  });

  // ── Full sync ──
  async function handleFullSync() {
    setSyncing(true);
    try {
      const results = await api("/bqe/sync/all", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["bqe-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      const total =
        (results.clients?.created ?? 0) + (results.clients?.updated ?? 0) +
        (results.projects?.created ?? 0) + (results.projects?.updated ?? 0) +
        (results.phases?.created ?? 0) + (results.phases?.updated ?? 0);
      toast({
        title: "Sync Complete",
        description: `${total} records synced from BQE Core.`,
      });
    } catch (e: any) {
      toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  // ── Push time entries ──
  async function handlePushTimeEntries() {
    try {
      const result = await api("/bqe/time-entries/push", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["bqe-sync-status"] });
      toast({
        title: "Time Entries Pushed",
        description: `${result.created} entries pushed to BQE Core. ${result.errors} errors.`,
      });
    } catch (e: any) {
      toast({ title: "Push Failed", description: e.message, variant: "destructive" });
    }
  }

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage integrations and app configuration</p>
      </div>

      {/* Team Members Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription className="mt-1">
                Manage your team. Add members so they can sign in and track time.
              </CardDescription>
            </div>
            {(isPM || isAdmin) && (
              <Button size="sm" onClick={openAddMember}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y">
              {(teamMembers as any[]).map((member: any) => (
                <div key={member.id} className="flex items-center gap-4 py-3">
                  <Avatar className="h-9 w-9 border border-border">
                    {member.profileImage ? (
                      <AvatarImage src={member.profileImage} />
                    ) : null}
                    <AvatarFallback className="text-xs font-semibold">
                      {getInitials(member.firstName, member.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      {[member.firstName, member.lastName].filter(Boolean).join(" ") || member.username}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {member.email || "No email set"}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 border ${ROLE_COLORS[member.role] || ROLE_COLORS.designer}`}
                  >
                    {ROLE_OPTIONS.find((r) => r.value === member.role)?.label || member.role}
                  </Badge>
                  {(isPM || isAdmin) && member.id !== currentUser?.id && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openEditMember(member)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${member.firstName || member.email}?`)) {
                              deleteMember.mutate(member.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                  {member.id === currentUser?.id && (
                    <span className="text-[10px] text-muted-foreground">You</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Member Dialog */}
      <Dialog
        open={addMemberOpen || !!editMemberId}
        onOpenChange={(open) => { if (!open) { setAddMemberOpen(false); setEditMemberId(null); } }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editMemberId ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={memberForm.email}
                onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                disabled={!!editMemberId}
                className={editMemberId ? "bg-muted/50" : ""}
              />
              {!editMemberId && (
                <p className="text-xs text-muted-foreground">
                  This email will identify them in the system.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input
                  placeholder="First"
                  value={memberForm.firstName}
                  onChange={(e) => setMemberForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input
                  placeholder="Last"
                  value={memberForm.lastName}
                  onChange={(e) => setMemberForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={memberForm.role}
                onValueChange={(v) => setMemberForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddMemberOpen(false); setEditMemberId(null); }}
            >
              Cancel
            </Button>
            <Button
              disabled={!memberForm.email || createMember.isPending || updateMember.isPending}
              onClick={() => {
                if (editMemberId) {
                  updateMember.mutate({
                    id: editMemberId,
                    data: { firstName: memberForm.firstName, lastName: memberForm.lastName, role: memberForm.role },
                  });
                } else {
                  createMember.mutate(memberForm);
                }
              }}
            >
              {(createMember.isPending || updateMember.isPending) ? "Saving..." : editMemberId ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BQE Core Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                BQE Core Integration
                {connected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <XCircle className="h-3 w-3 mr-1" /> Not Connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Two-way sync with BQE Core for projects, phases, time entries, and invoices
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!connected ? (
            <div className="space-y-3">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Connect your BQE Core account to sync projects, phases, and time entries.
                  You'll need BQE Core admin credentials to authorize the connection.
                </AlertDescription>
              </Alert>
              <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
                <Link2 className="h-4 w-4 mr-2" />
                Connect to BQE Core
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Connection info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {bqeStatus.companyName && (
                  <div>
                    <span className="text-muted-foreground">Company:</span>{" "}
                    <span className="font-medium">{bqeStatus.companyName}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Connected:</span>{" "}
                  <span className="font-medium">
                    {new Date(bqeStatus.connectedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Sync actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleFullSync} disabled={syncing} variant="default">
                  {syncing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4 mr-2" />
                  )}
                  Sync from Core
                </Button>
                <Button onClick={handlePushTimeEntries} variant="outline">
                  <ArrowUpFromLine className="h-4 w-4 mr-2" />
                  Push Time Entries
                </Button>
                <Button
                  onClick={() => disconnectMutation.mutate()}
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={disconnectMutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Log Card */}
      {connected && syncStatus?.recentSync && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sync Log
            </CardTitle>
            <CardDescription>Recent synchronization activity</CardDescription>
          </CardHeader>
          <CardContent>
            {syncStatus.recentSync.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync activity yet. Click "Sync from Core" to start.</p>
            ) : (
              <div className="space-y-2">
                {syncStatus.recentSync.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 text-sm py-2 border-b border-border last:border-0"
                  >
                    <div className="shrink-0">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {log.entityType}
                        </Badge>
                        {log.direction === "inbound" ? (
                          <ArrowDownToLine className="h-3 w-3 text-blue-400" />
                        ) : (
                          <ArrowUpFromLine className="h-3 w-3 text-orange-400" />
                        )}
                        <span className="truncate text-muted-foreground">
                          {log.details || log.errorMessage || "No details"}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.syncedAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
