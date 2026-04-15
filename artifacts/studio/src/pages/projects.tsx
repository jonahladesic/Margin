import { useState } from "react";
import { Link } from "wouter";
import { Plus, FileCheck, DollarSign, Clock, X, GripVertical, Briefcase, RefreshCw, UserPlus, Pencil } from "lucide-react";
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
import { useQueryClient, useMutation } from "@tanstack/react-query";

const PROJECT_COLORS = [
  "#f97316","#E8772E","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#ec4899","#14b8a6","#d97706","#22c55e",
  "#a855f7","#e11d48","#65a30d","#be185d","#047857",
  "#0f766e","#7c3aed","#f43f5e","#84cc16","#c084fc",
];

const PHASE_SUGGESTIONS = [
  "Discovery", "Vision", "Brand Identity", "Brand Standards",
  "City Submittal", "Schematic Design", "Design Development",
  "Construction Documents", "Permitting", "Bidding", "Construction Administration",
];

interface PhaseRow {
  name: string;
  budgetedHours: string;
}

interface TeamMember {
  name: string;
  role: string;
}

function NTPBadge({ received }: { received: boolean }) {
  return received ? (
    <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5">
      <FileCheck className="h-3 w-3" /> NTP
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-1.5">
      <Clock className="h-3 w-3" /> Awaiting NTP
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    paid:    { label: "Paid",    cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
    partial: { label: "Partial", cls: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
    unpaid:  { label: "Unpaid",  cls: "bg-red-500/10 text-red-500 border-red-500/20" },
  };
  const s = m[status] || m.unpaid;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 ${s.cls}`}>
      <DollarSign className="h-3 w-3" /> {s.label}
    </Badge>
  );
}

function WorkStatusBadge({ status }: { status: string }) {
  if (status === "awaiting_client") {
    return (
      <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px] px-1.5">
        <RefreshCw className="h-3 w-3" /> Awaiting Client
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 bg-orange-500/10 text-orange-400 border-orange-500/20 text-[10px] px-1.5">
      <Briefcase className="h-3 w-3" /> Working Internally
    </Badge>
  );
}

const DEFAULT_FORM = {
  name: "", clientId: "", status: "active",
  workStatus: "working_internally",
  budgetAmount: "10000", color: PROJECT_COLORS[0],
  ntpReceived: false, ntpDate: "", paymentStatus: "unpaid",
  billingCategory: "billable",
};

function getUniqueColor(allProjectColors: string[]): string {
  const unused = PROJECT_COLORS.find((c) => !allProjectColors.includes(c));
  if (unused) return unused;
  const counts = PROJECT_COLORS.map((c) => ({
    color: c,
    count: allProjectColors.filter((u) => u === c).length,
  }));
  counts.sort((a, b) => a.count - b.count);
  return counts[0].color;
}

export default function Projects() {
  const { data: projects = [], isLoading } = useListProjects();
  const { data: clients = [] } = useListClients();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [phases, setPhases] = useState<PhaseRow[]>([]);
  const [customPhase, setCustomPhase] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [newMember, setNewMember] = useState({ name: "", role: "designer" });
  const [renameProject, setRenameProject] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const renameProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const r = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error("Failed to rename project");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setRenameProject(null);
      toast({ title: "Project renamed" });
    },
    onError: () => toast({ title: "Failed to rename project", variant: "destructive" }),
  });

  const set = (key: string, value: any) => setFormData((f) => ({ ...f, [key]: value }));

  const addPhase = (name: string) => {
    if (!name.trim()) return;
    if (phases.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())) return;
    setPhases((p) => [...p, { name: name.trim(), budgetedHours: "0" }]);
    setCustomPhase("");
  };

  const removePhase = (idx: number) => setPhases((p) => p.filter((_, i) => i !== idx));

  const updatePhaseHours = (idx: number, hours: string) =>
    setPhases((p) => p.map((ph, i) => (i === idx ? { ...ph, budgetedHours: hours } : ph)));

  const totalPhaseHours = phases.reduce((sum, p) => sum + (parseFloat(p.budgetedHours) || 0), 0);

  const addTeamMember = () => {
    if (!newMember.name.trim()) return;
    setTeamMembers((prev) => [...prev, { name: newMember.name.trim(), role: newMember.role }]);
    setNewMember({ name: "", role: "designer" });
  };

  const removeTeamMember = (idx: number) => setTeamMembers((prev) => prev.filter((_, i) => i !== idx));

  const resetDialog = () => {
    setPhases([]);
    setCustomPhase("");
    setTeamMembers([]);
    setNewMember({ name: "", role: "designer" });
  };

  const handleDialogOpen = (open: boolean) => {
    if (open) {
      const allColors = (projects as any[]).map((p: any) => p.color).filter(Boolean);
      const color = getUniqueColor(allColors);
      setFormData({ ...DEFAULT_FORM, color });
      resetDialog();
    } else {
      setFormData({ ...DEFAULT_FORM });
      resetDialog();
    }
    setIsDialogOpen(open);
  };

  const handleCreate = () => {
    if (!formData.name) return;
    createProject.mutate(
      {
        data: {
          name: formData.name,
          clientId: formData.clientId || undefined,
          status: formData.status as any,
          workStatus: formData.workStatus as any,
          budgetAmount: Number(formData.budgetAmount),
          color: formData.color,
          ntpReceived: formData.ntpReceived,
          ntpDate: formData.ntpDate || undefined,
          paymentStatus: formData.paymentStatus as any,
          billingCategory: formData.billingCategory as any,
          phases: phases.map((p) => ({ name: p.name, budgetedHours: parseFloat(p.budgetedHours) || 0 })),
        } as any,
      },
      {
        onSuccess: async (data: any) => {
          const projectId = data?.id;
          let memberFailures = 0;
          if (projectId && teamMembers.length > 0) {
            const results = await Promise.all(
              teamMembers.map((m) =>
                fetch(`/api/projects/${projectId}/members`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: m.name, role: m.role }),
                }).then((r) => r.ok ? r : Promise.reject())
                  .catch(() => { memberFailures++; return null; })
              )
            );
            void results;
          }
          if (memberFailures > 0) {
            toast({
              title: "Project created, but some team members failed to save",
              description: `${memberFailures} member${memberFailures !== 1 ? "s" : ""} could not be added. Open the project to retry.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Project created",
              description: [
                phases.length > 0 && `${phases.length} phase${phases.length !== 1 ? "s" : ""}`,
                teamMembers.length > 0 && `${teamMembers.length} team member${teamMembers.length !== 1 ? "s" : ""}`,
              ].filter(Boolean).join(" · ") || undefined,
            });
          }
          setIsDialogOpen(false);
          setFormData({ ...DEFAULT_FORM });
          resetDialog();
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
      completed: "bg-orange-500/15 text-orange-500",
      cancelled: "bg-gray-500/15 text-gray-400",
    };
    return m[s] || m.cancelled;
  };

  const filtered = filter === "all" ? (projects as any[]) : (projects as any[]).filter((p) => p.status === filter);
  const usedSuggestions = new Set(phases.map((p) => p.name.toLowerCase()));

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage all active and past studio projects.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={handleDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-5 py-2">

              {/* Basic Info */}
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Project Name *</Label>
                  <Input value={formData.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Brand Identity" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Client</Label>
                    <Select value={formData.clientId || "none"} onValueChange={(v) => set("clientId", v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {(clients as any[]).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Budget ($)</Label>
                    <Input type="number" value={formData.budgetAmount} onChange={(e) => set("budgetAmount", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Work Status</Label>
                    <Select value={formData.workStatus} onValueChange={(v) => set("workStatus", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="working_internally">Working Internally</SelectItem>
                        <SelectItem value="awaiting_client">Awaiting Client Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Color</Label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {PROJECT_COLORS.map((c) => {
                        const isUsed = (projects as any[]).some((p: any) => p.color === c);
                        return (
                          <button key={c}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${formData.color === c ? "border-white scale-110" : "border-transparent"} ${isUsed && formData.color !== c ? "opacity-40" : ""}`}
                            style={{ backgroundColor: c }}
                            onClick={() => set("color", c)}
                            title={isUsed ? "Already in use by another project" : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <Label>Billing Category</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Overhead hours are tracked but not against a budget.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                    <button
                      onClick={() => set("billingCategory", "billable")}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${formData.billingCategory === "billable" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Billable
                    </button>
                    <button
                      onClick={() => set("billingCategory", "overhead")}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${formData.billingCategory === "overhead" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Overhead
                    </button>
                  </div>
                </div>
              </div>

              {/* Phases */}
              <div className="border-t pt-4 grid gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Phases & Scope</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define which phases are in scope and their hour budgets.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground bg-muted/50 px-3 py-1 rounded-md">
                    Total scoped: {totalPhaseHours}h
                  </span>
                </div>

                {/* Suggestions */}
                <div className="flex flex-wrap gap-1.5">
                  {PHASE_SUGGESTIONS.filter((s) => !usedSuggestions.has(s.toLowerCase())).map((s) => (
                    <button key={s}
                      onClick={() => addPhase(s)}
                      className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      + {s}
                    </button>
                  ))}
                </div>

                {/* Added phases list */}
                {phases.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {phases.map((ph, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        <span className="flex-1 text-sm font-medium">{ph.name}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            value={ph.budgetedHours}
                            onChange={(e) => updatePhaseHours(idx, e.target.value)}
                            className="w-20 h-7 text-sm text-right"
                          />
                          <span className="text-xs text-muted-foreground">hrs</span>
                        </div>
                        <button onClick={() => removePhase(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Running total — always visible */}
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-sm text-muted-foreground">Total scoped</span>
                  <span className="text-sm font-bold text-foreground">{totalPhaseHours}h</span>
                </div>

                {/* Custom phase input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Custom phase name…"
                    value={customPhase}
                    onChange={(e) => setCustomPhase(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addPhase(customPhase); }}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={() => addPhase(customPhase)} disabled={!customPhase.trim()}>
                    Add
                  </Button>
                </div>
                {phases.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    No phases added yet — click a suggestion above or type a custom phase name.
                  </p>
                )}
              </div>

              {/* Billing */}
              <div className="border-t pt-4 grid gap-3">
                <Label className="text-base">Billing Status</Label>
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

              {/* Team */}
              <div className="border-t pt-4 grid gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Team</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Assign team members to this project.</p>
                  </div>
                </div>

                {/* Added members */}
                {teamMembers.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {teamMembers.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="flex-1 text-sm font-medium">{m.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${m.role === "lead" ? "border-primary/40 text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                          {m.role === "lead" ? "Project Lead" : "Designer"}
                        </Badge>
                        <button onClick={() => removeTeamMember(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add member form */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Team member name…"
                    value={newMember.name}
                    onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addTeamMember(); }}
                    className="flex-1"
                  />
                  <Select value={newMember.role} onValueChange={(v) => setNewMember((m) => ({ ...m, role: v }))}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="designer">Designer</SelectItem>
                      <SelectItem value="lead">Project Lead</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={addTeamMember} disabled={!newMember.name.trim()}>
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
                {teamMembers.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No team members added yet.</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createProject.isPending || !formData.name}>
                {createProject.isPending ? "Creating…" : [
                  "Create Project",
                  phases.length > 0 && `· ${phases.length} phase${phases.length !== 1 ? "s" : ""}`,
                  teamMembers.length > 0 && `· ${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""}`,
                ].filter(Boolean).join(" ")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameProject} onOpenChange={(o) => { if (!o) setRenameProject(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="sr-only">Project name</Label>
            <Input
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameInput.trim() && renameProject) {
                  renameProjectMutation.mutate({ id: renameProject.id, name: renameInput.trim() });
                } else if (e.key === "Escape") {
                  setRenameProject(null);
                }
              }}
              placeholder="Project name…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameProject(null)}>Cancel</Button>
            <Button
              disabled={!renameInput.trim() || renameProjectMutation.isPending}
              onClick={() => renameProject && renameProjectMutation.mutate({ id: renameProject.id, name: renameInput.trim() })}
            >
              {renameProjectMutation.isPending ? "Saving…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {["all","active","on_hold","completed","cancelled"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            {s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}
            {" "}<span className="text-xs opacity-70">
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
          <Button onClick={() => handleDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Create First Project</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((project: any) => {
            const pct = project.budgetedHours > 0 ? (project.loggedHours / project.budgetedHours) * 100 : 0;
            const over = pct > 90;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full hover:-translate-y-0.5 transition-all cursor-pointer overflow-hidden border-l-[5px] group/card"
                  style={{ borderLeftColor: project.color || "var(--primary)" }}>
                  <div className="p-5 flex flex-col gap-3 h-full">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <h3 className="font-semibold text-base line-clamp-1">{project.name}</h3>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRenameProject({ id: project.id, name: project.name });
                              setRenameInput(project.name);
                            }}
                            className="opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                            title="Rename project"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {project.coreProjectNumber && <span className="font-mono mr-1">{project.coreProjectNumber}</span>}
                          {project.clientName || "Internal"}
                        </p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 border-transparent ${statusColor(project.status)}`}>
                        {project.status.replace("_", " ").toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {project.coreProjectId && (
                        <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] px-1.5">
                          BQE
                        </Badge>
                      )}
                      {project.billingCategory === "overhead" && (
                        <Badge variant="outline" className="gap-1 bg-slate-500/10 text-slate-400 border-slate-500/20 text-[10px] px-1.5">
                          Overhead
                        </Badge>
                      )}
                      <NTPBadge received={project.ntpReceived} />
                      <PaymentBadge status={project.paymentStatus} />
                      <WorkStatusBadge status={project.workStatus || "working_internally"} />
                    </div>

                    <div className="flex-1" />

                    {project.budgetedHours > 0 ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Hours</span>
                          <span className={`font-medium ${over ? "text-destructive" : ""}`}>
                            {project.loggedHours} / {project.budgetedHours}h
                          </span>
                        </div>
                        <Progress value={Math.min(pct, 100)} className="h-1.5" />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No phases defined</p>
                    )}

                    <div className="flex justify-between items-center text-xs text-muted-foreground border-t border-border pt-2">
                      <span className="text-xs text-muted-foreground">
                        {project.budgetAmount ? `$${Number(project.budgetAmount).toLocaleString()} budget` : "No budget set"}
                      </span>
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
