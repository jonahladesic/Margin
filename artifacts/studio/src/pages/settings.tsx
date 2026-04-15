import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Link2, Unlink, CheckCircle2, XCircle, AlertCircle,
  ArrowDownToLine, ArrowUpFromLine, Clock, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Alert, AlertDescription,
} from "@/components/ui/alert";

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

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: bqeStatus, isLoading: statusLoading } = useBqeStatus();
  const { data: syncStatus } = useSyncStatus();
  const [syncing, setSyncing] = useState(false);

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
