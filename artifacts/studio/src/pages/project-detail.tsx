import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { format } from "date-fns";
import {
  ChevronLeft, FileCheck, DollarSign, Clock, Plus, Check, X,
  ChevronDown, ChevronRight as ChevronRightIcon, Pencil, Trash2,
  Users, Briefcase, RefreshCw, UserCircle,
} from "lucide-react";
import {
  useGetProject, useListTimeBlocks, useListExpenses, useListInvoices,
  useUpdateTimeBlock, useUpdateProject, useListClients,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const SUB_PHASES = ["Project", "Design", "Meetings", "Internal Meetings"];

const PHASE_SUGGESTIONS = [
  "Discovery", "Vision", "Brand Identity", "Brand Standards",
  "City Submittal", "Schematic Design", "Design Development",
  "Construction Documents", "Permitting", "Bidding", "Construction Administration",
];

type ViewRole = "lead" | "designer";

function NTPBadge({ received }: { received: boolean }) {
  return received ? (
    <Badge variant="outline" className="gap-1.5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
      <FileCheck className="h-3.5 w-3.5" /> NTP Received
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1.5 bg-amber-500/10 text-amber-500 border-amber-500/20">
      <Clock className="h-3.5 w-3.5" /> Awaiting NTP
    </Badge>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const m: Record<string, string> = {
    paid:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    partial: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    unpaid:  "bg-red-500/10 text-red-500 border-red-500/20",
  };
  const labels: Record<string, string> = { paid: "Paid", partial: "Partial Payment", unpaid: "Unpaid" };
  return (
    <Badge variant="outline" className={`gap-1.5 ${m[status] || m.unpaid}`}>
      <DollarSign className="h-3.5 w-3.5" /> {labels[status] || "Unpaid"}
    </Badge>
  );
}

function WorkStatusBadge({ status }: { status: string }) {
  if (status === "awaiting_client") {
    return (
      <Badge variant="outline" className="gap-1.5 bg-purple-500/10 text-purple-400 border-purple-500/20">
        <RefreshCw className="h-3.5 w-3.5" /> Awaiting Client Feedback
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 bg-orange-500/10 text-orange-400 border-orange-500/20">
      <Briefcase className="h-3.5 w-3.5" /> Working Internally
    </Badge>
  );
}

function PhaseCard({
  phase,
  timeblocks,
  onToggleEnabled,
  onUpdateHours,
  onDelete,
  hideFinancials,
}: {
  phase: any;
  timeblocks: any[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onUpdateHours: (id: string, hours: number) => void;
  onDelete: (id: string) => void;
  hideFinancials: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [hoursInput, setHoursInput] = useState(String(phase.budgetedHours));

  const phaseBlocks = timeblocks.filter((tb) => tb.phaseId === phase.id);
  const loggedHours = phaseBlocks.reduce((sum: number, tb: any) => sum + tb.hours, 0);
  const pct = phase.budgetedHours > 0 ? (loggedHours / phase.budgetedHours) * 100 : 0;
  const remaining = phase.budgetedHours - loggedHours;
  const isOver = remaining < 0;
  const isDisabled = !phase.enabled;

  const subTotals = SUB_PHASES.map((sp) => ({
    name: sp,
    hours: phaseBlocks
      .filter((tb: any) => tb.subPhase === sp)
      .reduce((sum: number, tb: any) => sum + tb.hours, 0),
  }));

  const handleSaveHours = () => {
    const h = parseFloat(hoursInput);
    if (!isNaN(h) && h >= 0) onUpdateHours(phase.id, h);
    setEditing(false);
  };

  return (
    <Card className={`overflow-hidden transition-opacity ${isDisabled ? "opacity-50" : ""}`}>
      <div className="p-4 flex items-center gap-3">
        <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-sm ${isDisabled ? "line-through text-muted-foreground" : ""}`}>
              {phase.name}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 border-transparent ${
              phase.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
              phase.status === "in_progress" ? "bg-orange-500/10 text-orange-500" :
              "bg-muted text-muted-foreground"
            }`}>
              {phase.status?.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {!hideFinancials && (
            <>
              {/* Logged */}
              <div className="text-right hidden sm:block">
                <div className="text-xs text-muted-foreground">Logged</div>
                <div className={`text-sm font-semibold ${isOver ? "text-destructive" : ""}`}>{loggedHours}h</div>
              </div>

              {/* Budget (editable) */}
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Budgeted</div>
                {editing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min="0" value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      onBlur={handleSaveHours}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveHours(); if (e.key === "Escape") setEditing(false); }}
                      className="w-20 h-6 text-sm text-right p-1"
                      autoFocus
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                  </div>
                ) : (
                  <button
                    onClick={() => { setHoursInput(String(phase.budgetedHours)); setEditing(true); }}
                    className="flex items-center gap-1 text-sm font-semibold hover:text-primary group"
                  >
                    {phase.budgetedHours}h
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                )}
              </div>

              {/* Remaining */}
              <div className={`text-right hidden sm:block ${isOver ? "text-destructive" : "text-muted-foreground"}`}>
                <div className="text-xs">Remaining</div>
                <div className="text-sm font-medium">
                  {isOver ? `-${Math.abs(remaining).toFixed(1)}h` : `${remaining.toFixed(1)}h`}
                </div>
              </div>
            </>
          )}

          {/* Enabled toggle */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground">In Scope</span>
            <Switch
              checked={phase.enabled}
              onCheckedChange={(v) => onToggleEnabled(phase.id, v)}
            />
          </div>

          {!hideFinancials && (
            /* Delete */
            <button
              onClick={() => onDelete(phase.id)}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {!isDisabled && phase.budgetedHours > 0 && !hideFinancials && (
        <div className="px-4 pb-1">
          <Progress
            value={Math.min(pct, 100)}
            className="h-1"
          />
        </div>
      )}

      {/* Expanded sub-phase breakdown */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t bg-muted/5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {subTotals.map((sp) => (
              <div key={sp.name} className="bg-background rounded-md border p-2.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{sp.name}</div>
                <div className="text-lg font-bold mt-0.5">{sp.hours}<span className="text-xs font-normal text-muted-foreground">h</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewRole, setViewRole] = useState<ViewRole>("lead");
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);

  const { data: project, isLoading: projectLoading } = useGetProject(id || "");
  const { data: clients = [] } = useListClients();
  const { data: timeblocks = [] } = useListTimeBlocks({ request: { query: { projectId: id } } });
  const { data: expenses = [] } = useListExpenses({ request: { query: { projectId: id } } });
  const { data: invoices = [] } = useListInvoices({ request: { query: { projectId: id } } });

  const { data: phases = [], refetch: refetchPhases } = useQuery({
    queryKey: ["/api/projects", id, "phases"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${id}/phases`);
      return r.json();
    },
    enabled: !!id,
  });

  const { data: members = [], refetch: refetchMembers } = useQuery({
    queryKey: ["/api/projects", id, "members"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${id}/members`);
      return r.json();
    },
    enabled: !!id,
  });

  const updateTimeBlock = useUpdateTimeBlock();
  const updateProject = useUpdateProject();

  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseHours, setNewPhaseHours] = useState("0");
  const [showAddPhase, setShowAddPhase] = useState(false);

  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"lead" | "designer">("designer");
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const PROJECT_COLORS = ["#f97316","#E8772E","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

  const openEditProject = () => {
    if (!project) return;
    setEditForm({
      name: (project as any).name || "",
      clientId: (project as any).clientId || "",
      type: (project as any).type || "branding",
      status: (project as any).status || "active",
      budgetedHours: String((project as any).budgetedHours ?? ""),
      budgetAmount: String((project as any).budgetAmount ?? ""),
      color: (project as any).color || "#f97316",
      startDate: (project as any).startDate || "",
      endDate: (project as any).endDate || "",
      description: (project as any).description || "",
    });
    setEditProjectOpen(true);
  };

  const setEdit = (k: string, v: any) => setEditForm((f: any) => ({ ...f, [k]: v }));

  const handleSaveProject = () => {
    if (!editForm || !project) return;
    updateProject.mutate(
      {
        id: (project as any).id,
        data: {
          name: editForm.name,
          clientId: editForm.clientId || undefined,
          type: editForm.type,
          status: editForm.status,
          budgetedHours: Number(editForm.budgetedHours) || undefined,
          budgetAmount: Number(editForm.budgetAmount) || undefined,
          color: editForm.color,
          startDate: editForm.startDate || undefined,
          endDate: editForm.endDate || undefined,
          description: editForm.description || undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Project updated" });
          setEditProjectOpen(false);
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        },
        onError: () => toast({ title: "Failed to update project", variant: "destructive" }),
      }
    );
  };

  const addPhaseMutation = useMutation({
    mutationFn: async (data: { name: string; budgetedHours: number }) => {
      const r = await fetch(`/api/projects/${id}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, sortOrder: (phases as any[]).length }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Phase added" });
      setNewPhaseName("");
      setNewPhaseHours("0");
      setShowAddPhase(false);
      refetchPhases();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
    },
  });

  const updatePhaseMutation = useMutation({
    mutationFn: async (data: { id: string; [key: string]: any }) => {
      const { id: phId, ...body } = data;
      const r = await fetch(`/api/phases/${phId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      refetchPhases();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
    },
  });

  const deletePhaseMutation = useMutation({
    mutationFn: async (phaseId: string) => {
      const r = await fetch(`/api/phases/${phaseId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Phase removed" });
      refetchPhases();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async (data: { name: string; role: string }) => {
      const r = await fetch(`/api/projects/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Team member added" });
      setNewMemberName("");
      setNewMemberRole("designer");
      setShowAddMember(false);
      refetchMembers();
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const r = await fetch(`/api/projects/${id}/members/${memberId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "Team member removed" });
      refetchMembers();
    },
  });

  const handleApproveTime = (tbId: string, approved: boolean) => {
    updateTimeBlock.mutate({ id: tbId, data: { approved } as any }, {
      onSuccess: () => {
        toast({ title: approved ? "Time approved" : "Time unapproved" });
        queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
      },
    });
  };

  const handleToggleNTP = (ntpReceived: boolean) => {
    if (!project) return;
    updateProject.mutate({ id: project.id, data: { ntpReceived } as any }, {
      onSuccess: () => {
        toast({ title: ntpReceived ? "NTP marked received" : "NTP cleared" });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      },
    });
  };

  const handlePaymentStatus = (paymentStatus: string) => {
    if (!project) return;
    updateProject.mutate({ id: project.id, data: { paymentStatus } as any }, {
      onSuccess: () => {
        toast({ title: `Payment status updated` });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      },
    });
  };

  const handleWorkStatus = (workStatus: string) => {
    if (!project) return;
    updateProject.mutate({ id: project.id, data: { workStatus } as any }, {
      onSuccess: () => {
        toast({ title: "Work status updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      },
    });
  };

  if (projectLoading) return <div className="p-8 text-muted-foreground">Loading project…</div>;
  if (!project) return <div className="p-8 text-destructive">Project not found</div>;

  const sortedPhases = [...(phases as any[])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const enabledPhases = sortedPhases.filter((p) => p.enabled);
  const totalBudgeted = enabledPhases.reduce((sum: number, p: any) => sum + p.budgetedHours, 0);
  const totalLogged = (timeblocks as any[]).reduce((sum: number, tb: any) => sum + tb.hours, 0);
  const totalRemaining = totalBudgeted - totalLogged;
  const totalPct = totalBudgeted > 0 ? (totalLogged / totalBudgeted) * 100 : 0;
  const isOverBudget = totalRemaining < 0;

  const usedSuggestions = new Set(sortedPhases.map((p: any) => p.name.toLowerCase()));
  const isDesigner = viewRole === "designer";

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6">
      {/* Back nav */}
      <Link href="/projects">
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ChevronLeft className="h-4 w-4" /> Projects
        </Button>
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color || "var(--primary)" }} />
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={() => {
                  if (nameInput.trim() && nameInput.trim() !== project.name) {
                    updateProject.mutate({ id: project.id, data: { name: nameInput.trim() } as any });
                  }
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    setEditingName(false);
                  }
                }}
                className="text-2xl font-bold tracking-tight bg-muted/40 border border-primary/40 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-primary/30 min-w-0 max-w-sm"
              />
            ) : (
              <div className="flex items-center gap-2 group/title">
                <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
                <button
                  onClick={() => { setNameInput(project.name); setEditingName(true); }}
                  className="opacity-0 group-hover/title:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  title="Rename project"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )}
            <Badge variant="outline" className="uppercase">{project.status?.replace("_", " ")}</Badge>
            <Button variant="outline" size="sm" onClick={openEditProject} className="ml-2">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          {/* View as role selector */}
          <div className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5 bg-muted/10">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">View as:</span>
            <button
              onClick={() => setViewRole("lead")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${viewRole === "lead" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Project Lead
            </button>
            <button
              onClick={() => setViewRole("designer")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${viewRole === "designer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Designer
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <p className="text-muted-foreground">{(project as any).clientName || "Internal Project"}</p>
          <WorkStatusBadge status={(project as any).workStatus || "working_internally"} />
          {!isDesigner && <NTPBadge received={(project as any).ntpReceived} />}
          {!isDesigner && <PaymentBadge status={(project as any).paymentStatus} />}
        </div>
      </div>

      {/* Summary stats — hidden for Designer role */}
      {!isDesigner && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Budgeted</div>
            <div className="text-2xl font-bold mt-1">{totalBudgeted}<span className="text-sm font-normal text-muted-foreground">h</span></div>
            <div className="text-xs text-muted-foreground mt-1">{enabledPhases.length} active phase{enabledPhases.length !== 1 ? "s" : ""}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Logged</div>
            <div className="text-2xl font-bold mt-1">{totalLogged}<span className="text-sm font-normal text-muted-foreground">h</span></div>
            <Progress value={Math.min(totalPct, 100)} className="h-1 mt-2" />
          </Card>
          <Card className={`p-4 ${isOverBudget ? "border-destructive/40" : ""}`}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{isOverBudget ? "Over Budget" : "Remaining"}</div>
            <div className={`text-2xl font-bold mt-1 ${isOverBudget ? "text-destructive" : "text-emerald-500"}`}>
              {isOverBudget ? "-" : ""}{Math.abs(totalRemaining).toFixed(1)}<span className="text-sm font-normal text-muted-foreground">h</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{Math.round(totalPct)}% utilized</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Budget</div>
            <div className="text-2xl font-bold mt-1">
              {project.budgetAmount ? `$${Number(project.budgetAmount).toLocaleString()}` : "—"}
            </div>
          </Card>
        </div>
      )}

      <Tabs defaultValue="phases" className="w-full">
        <TabsList className="bg-muted/20">
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="time">Time Logs</TabsTrigger>
          {!isDesigner && <TabsTrigger value="expenses">Expenses</TabsTrigger>}
          {!isDesigner && <TabsTrigger value="invoices">Invoices</TabsTrigger>}
          {!isDesigner && <TabsTrigger value="team">Team</TabsTrigger>}
          {!isDesigner && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        {/* PHASES TAB */}
        <TabsContent value="phases" className="mt-5">
          <div className="flex flex-col gap-3">
            {sortedPhases.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No phases defined for this project yet.</p>
                {!isDesigner && (
                  <Button onClick={() => setShowAddPhase(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add First Phase
                  </Button>
                )}
              </Card>
            ) : (
              <>
                {/* Phase suggestion chips — Lead only */}
                {!isDesigner && (
                  <div className="flex flex-wrap gap-1.5">
                    {PHASE_SUGGESTIONS.filter((s) => !usedSuggestions.has(s.toLowerCase())).slice(0, 6).map((s) => (
                      <button key={s}
                        onClick={() => addPhaseMutation.mutate({ name: s, budgetedHours: 0 })}
                        className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors">
                        + {s}
                      </button>
                    ))}
                  </div>
                )}

                {sortedPhases.map((phase: any) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    timeblocks={timeblocks as any[]}
                    hideFinancials={isDesigner}
                    onToggleEnabled={(phId, enabled) => updatePhaseMutation.mutate({ id: phId, enabled })}
                    onUpdateHours={(phId, budgetedHours) => {
                      updatePhaseMutation.mutate({ id: phId, budgetedHours });
                      const newTotal = sortedPhases.reduce((sum: number, p: any) =>
                        sum + (p.id === phId ? budgetedHours : p.budgetedHours), 0);
                      updateProject.mutate({ id: project.id, data: { budgetedHours: newTotal } as any });
                    }}
                    onDelete={(phId) => deletePhaseMutation.mutate(phId)}
                  />
                ))}
              </>
            )}

            {/* Add phase — Lead only */}
            {!isDesigner && (
              showAddPhase ? (
                <Card className="p-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 grid gap-2">
                      <Label>Phase Name</Label>
                      <Input
                        placeholder="e.g. Brand Standards"
                        value={newPhaseName}
                        onChange={(e) => setNewPhaseName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newPhaseName.trim())
                            addPhaseMutation.mutate({ name: newPhaseName.trim(), budgetedHours: parseFloat(newPhaseHours) || 0 });
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="w-28 grid gap-2">
                      <Label>Hours Budget</Label>
                      <Input
                        type="number" min="0" value={newPhaseHours}
                        onChange={(e) => setNewPhaseHours(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={() => {
                        if (!newPhaseName.trim()) return;
                        addPhaseMutation.mutate({ name: newPhaseName.trim(), budgetedHours: parseFloat(newPhaseHours) || 0 });
                      }}
                      disabled={!newPhaseName.trim() || addPhaseMutation.isPending}
                    >
                      Add
                    </Button>
                    <Button variant="ghost" onClick={() => setShowAddPhase(false)}>Cancel</Button>
                  </div>
                </Card>
              ) : (
                <Button variant="outline" className="self-start" onClick={() => setShowAddPhase(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Phase
                </Button>
              )
            )}
          </div>
        </TabsContent>

        {/* TIME LOGS TAB */}
        <TabsContent value="time" className="mt-5">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Sub-phase</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Notes</TableHead>
                  {!isDesigner && <TableHead>Approved</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(timeblocks as any[]).map((tb) => (
                  <TableRow key={tb.id}>
                    <TableCell className="text-sm">{tb.date}</TableCell>
                    <TableCell>{tb.phaseName || "—"}</TableCell>
                    <TableCell>{tb.subPhase || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{tb.hours}h</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">{tb.description || "—"}</TableCell>
                    {!isDesigner && (
                      <TableCell>
                        <button onClick={() => handleApproveTime(tb.id, !tb.approved)}>
                          {tb.approved
                            ? <Check className="h-4 w-4 text-emerald-500" />
                            : <X className="h-4 w-4 text-muted-foreground" />}
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {(timeblocks as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={isDesigner ? 5 : 6} className="text-center py-8 text-muted-foreground">No time logged yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* EXPENSES TAB — Lead only */}
        {!isDesigner && (
          <TabsContent value="expenses" className="mt-5">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(expenses as any[]).map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.date}</TableCell>
                      <TableCell>{exp.description}</TableCell>
                      <TableCell>{exp.category}</TableCell>
                      <TableCell className="text-right font-medium">${exp.amount?.toLocaleString()}</TableCell>
                      <TableCell>
                        {exp.approved
                          ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-0">Approved</Badge>
                          : <Badge variant="outline" className="bg-muted text-muted-foreground border-0">Pending</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(expenses as any[]).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses recorded.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}

        {/* INVOICES TAB — Lead only */}
        {!isDesigner && (
          <TabsContent value="invoices" className="mt-5">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices as any[]).map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>{format(new Date(inv.issueDate), "MMM d, yyyy")}</TableCell>
                      <TableCell>{format(new Date(inv.dueDate), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-medium">${inv.total?.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline" className="uppercase">{inv.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(invoices as any[]).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}

        {/* TEAM TAB — Lead only */}
        {!isDesigner && (
          <TabsContent value="team" className="mt-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Team Members</h3>
                  <p className="text-sm text-muted-foreground">People assigned to this project.</p>
                </div>
                {!showAddMember && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddMember(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Member
                  </Button>
                )}
              </div>

              {/* Add member form */}
              {showAddMember && (
                <Card className="p-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 grid gap-2">
                      <Label>Name</Label>
                      <Input
                        placeholder="e.g. Sarah Kim"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newMemberName.trim())
                            addMemberMutation.mutate({ name: newMemberName.trim(), role: newMemberRole });
                        }}
                      />
                    </div>
                    <div className="w-44 grid gap-2">
                      <Label>Role</Label>
                      <Select value={newMemberRole} onValueChange={(v) => setNewMemberRole(v as "lead" | "designer")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Project Lead</SelectItem>
                          <SelectItem value="designer">Designer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={() => {
                        if (!newMemberName.trim()) return;
                        addMemberMutation.mutate({ name: newMemberName.trim(), role: newMemberRole });
                      }}
                      disabled={!newMemberName.trim() || addMemberMutation.isPending}
                    >
                      Add
                    </Button>
                    <Button variant="ghost" onClick={() => setShowAddMember(false)}>Cancel</Button>
                  </div>
                </Card>
              )}

              {/* Member list */}
              {(members as any[]).length === 0 ? (
                <Card className="p-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No team members assigned yet.</p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {(members as any[]).map((member: any) => (
                    <Card key={member.id} className="p-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserCircle className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{member.name}</div>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${
                        member.role === "lead"
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-muted text-muted-foreground border-transparent"
                      }`}>
                        {member.role === "lead" ? "Project Lead" : "Designer"}
                      </Badge>
                      <button
                        onClick={() => deleteMemberMutation.mutate(member.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        )}

        {/* SETTINGS TAB — Lead only */}
        {!isDesigner && (
          <TabsContent value="settings" className="mt-5">
            <div className="grid gap-4 max-w-md">
              <Card className="p-5 grid gap-4">
                <h3 className="font-semibold">Work Status</h3>
                <div className="grid gap-2">
                  <Label>Current Work Status</Label>
                  <Select value={(project as any).workStatus || "working_internally"} onValueChange={handleWorkStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working_internally">Working Internally</SelectItem>
                      <SelectItem value="awaiting_client">Awaiting Client Feedback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Card>
              <Card className="p-5 grid gap-4">
                <h3 className="font-semibold">Billing Category</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Project Type</Label>
                    <p className="text-xs text-muted-foreground">Overhead hours are tracked but not against a budget.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                    <button
                      onClick={() => updateProject.mutate({ id: project!.id, data: { billingCategory: "billable" } as any }, { onSuccess: () => { toast({ title: "Updated to billable" }); queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}`] }); } })}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${(project as any).billingCategory !== "overhead" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Billable
                    </button>
                    <button
                      onClick={() => updateProject.mutate({ id: project!.id, data: { billingCategory: "overhead" } as any }, { onSuccess: () => { toast({ title: "Updated to overhead" }); queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}`] }); } })}
                      className={`text-xs px-3 py-1.5 rounded-md transition-colors ${(project as any).billingCategory === "overhead" ? "bg-background shadow-sm font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Overhead
                    </button>
                  </div>
                </div>
              </Card>
              <Card className="p-5 grid gap-4">
                <h3 className="font-semibold">Billing Controls</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>NTP Received</Label>
                    <p className="text-xs text-muted-foreground">Notice to Proceed from client</p>
                  </div>
                  <Switch checked={(project as any).ntpReceived} onCheckedChange={handleToggleNTP} />
                </div>
                <div className="grid gap-2">
                  <Label>Payment Status</Label>
                  <Select value={(project as any).paymentStatus} onValueChange={handlePaymentStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Card>
              <Card className="p-5 grid gap-4 border-destructive/30">
                <h3 className="font-semibold text-destructive">Danger Zone</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Delete Project</Label>
                    <p className="text-xs text-muted-foreground">Permanently delete this project and all its data.</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete Project
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{project?.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this project along with all its phases, time entries, allocations, invoices, and expenses. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={async () => {
                            try {
                              await fetch(`/api/projects/${id}`, { method: "DELETE" });
                              toast({ title: "Project deleted" });
                              queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                              navigate("/projects");
                            } catch {
                              toast({ title: "Failed to delete project", variant: "destructive" });
                            }
                          }}
                        >
                          Delete Project
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* ── Edit Project Dialog ── */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Project Name</Label>
                <Input value={editForm.name} onChange={(e) => setEdit("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Client</Label>
                  <Select value={editForm.clientId || "none"} onValueChange={(v) => setEdit("clientId", v === "none" ? "" : v)}>
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
                  <Label>Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEdit("type", v)}>
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
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEdit("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Color</Label>
                  <div className="flex gap-1.5 items-center h-9">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${editForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setEdit("color", c)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Budget Hours</Label>
                  <Input type="number" value={editForm.budgetedHours} onChange={(e) => setEdit("budgetedHours", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Budget ($)</Label>
                  <Input type="number" value={editForm.budgetAmount} onChange={(e) => setEdit("budgetAmount", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={editForm.startDate} onChange={(e) => setEdit("startDate", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>End Date</Label>
                  <Input type="date" value={editForm.endDate} onChange={(e) => setEdit("endDate", e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Project description..."
                  value={editForm.description}
                  onChange={(e) => setEdit("description", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveProject} disabled={updateProject.isPending || !editForm?.name}>
              {updateProject.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
