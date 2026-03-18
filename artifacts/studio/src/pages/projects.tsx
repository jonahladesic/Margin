import { useState } from "react";
import { Link } from "wouter";
import { Plus, FileCheck, DollarSign, Clock } from "lucide-react";
import { useListProjects, useCreateProject, useListClients } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PROJECT_COLORS = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

function NTPBadge({ received, date }: { received: boolean; date?: string | null }) {
  if (received) {
    return (
      <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5 py-0.5">
        <FileCheck className="h-3 w-3" />
        NTP
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5 py-0.5">
      <Clock className="h-3 w-3" />
      Awaiting NTP
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid:    { label: "Paid",    cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    partial: { label: "Partial", cls: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    unpaid:  { label: "Unpaid",  cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  };
  const s = map[status] || map.unpaid;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 py-0.5 ${s.cls}`}>
      <DollarSign className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

const DEFAULT_FORM = {
  name: "", clientId: "", status: "active", type: "branding",
  budgetedHours: "100", budgetAmount: "10000", color: "#4f46e5",
  ntpReceived: false, ntpDate: "", paymentStatus: "unpaid",
};

export default function Projects() {
  const { data: projects = [], isLoading } = useListProjects();
  const { data: clients = [] } = useListClients();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [filter, setFilter] = useState<string>("all");

  const set = (key: string, value: any) => setFormData((f) => ({ ...f, [key]: value }));

  const handleCreate = () => {
    if (!formData.name) return;
    createProject.mutate(
      {
        data: {
          name: formData.name,
          clientId: formData.clientId || undefined,
          status: formData.status as any,
          type: formData.type as any,
          budgetedHours: Number(formData.budgetedHours),
          budgetAmount: Number(formData.budgetAmount),
          color: formData.color,
          ntpReceived: formData.ntpReceived,
          ntpDate: formData.ntpDate || undefined,
          paymentStatus: formData.paymentStatus as any,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Project created — 4 phases auto-added" });
          setIsDialogOpen(false);
          setFormData({ ...DEFAULT_FORM });
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        },
        onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
      }
    );
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = {
      active:    "bg-emerald-500/15 text-emerald-500",
      on_hold:   "bg-amber-500/15 text-amber-500",
      completed: "bg-blue-500/15 text-blue-500",
      cancelled: "bg-gray-500/15 text-gray-400",
    };
    return m[s] || m.cancelled;
  };

  const filtered = filter === "all" ? (projects as any[]) : (projects as any[]).filter((p) => p.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage all active and past studio projects.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Project Name *</Label>
                <Input value={formData.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Brand Identity" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <Select value={formData.clientId} onValueChange={(v) => set("clientId", v)}>
                    <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No client</SelectItem>
                      {(clients as any[]).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={(v) => set("type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["branding","web","interior","architecture","other"].map((t) => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Budgeted Hours</Label>
                  <Input type="number" value={formData.budgetedHours} onChange={(e) => set("budgetedHours", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Budget ($)</Label>
                  <Input type="number" value={formData.budgetAmount} onChange={(e) => set("budgetAmount", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${formData.color === c ? "border-white scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      onClick={() => set("color", c)}
                    />
                  ))}
                </div>
              </div>
              <div className="border-t pt-4 grid gap-4">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Billing Status</p>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>NTP Received</Label>
                    <p className="text-xs text-muted-foreground">Notice to Proceed from client</p>
                  </div>
                  <Switch checked={formData.ntpReceived} onCheckedChange={(v) => set("ntpReceived", v)} />
                </div>
                {formData.ntpReceived && (
                  <div className="grid gap-2">
                    <Label>NTP Date</Label>
                    <Input type="date" value={formData.ntpDate} onChange={(e) => set("ntpDate", e.target.value)} />
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Payment Status</Label>
                  <Select value={formData.paymentStatus} onValueChange={(v) => set("paymentStatus", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createProject.isPending || !formData.name}>
                {createProject.isPending ? "Creating…" : "Create Project"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2">
        {["all","active","on_hold","completed","cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}
            {" "}
            <span className="text-xs opacity-70">
              ({s === "all" ? (projects as any[]).length : (projects as any[]).filter((p: any) => p.status === s).length})
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading projects…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 flex flex-col items-center gap-4">
          <div className="text-muted-foreground text-lg">No projects found</div>
          <Button onClick={() => setIsDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Create First Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((project: any) => {
            const pct = project.budgetedHours > 0 ? (project.loggedHours / project.budgetedHours) * 100 : 0;
            const over = pct > 90;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden border-l-[5px]"
                  style={{ borderLeftColor: project.color || "var(--primary)" }}>
                  <div className="p-5 flex flex-col gap-3 h-full">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base line-clamp-1">{project.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{project.clientName || "Internal"}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 border-transparent ${statusColor(project.status)}`}>
                        {project.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <NTPBadge received={project.ntpReceived} date={project.ntpDate} />
                      <PaymentBadge status={project.paymentStatus} />
                    </div>

                    <div className="flex-1" />

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Hours</span>
                        <span className={`font-medium ${over ? "text-destructive" : ""}`}>
                          {project.loggedHours} / {project.budgetedHours}
                        </span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-1.5" />
                    </div>

                    <div className="flex justify-between items-center text-xs text-muted-foreground border-t border-border pt-2">
                      <span className="uppercase">{project.type}</span>
                      {project.budgetAmount && (
                        <span className="font-medium text-foreground">${Number(project.budgetAmount).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
