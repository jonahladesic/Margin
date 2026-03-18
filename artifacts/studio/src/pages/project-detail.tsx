import { useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import {
  ChevronLeft, FileCheck, DollarSign, Clock, Plus, Check, X,
  ChevronDown, ChevronRight as ChevronRightIcon, Pencil, Trash2,
} from "lucide-react";
import {
  useGetProject, useListTimeBlocks, useListExpenses, useListInvoices,
  useUpdateTimeBlock, useUpdateProject,
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
import { useToast } from "@/hooks/use-toast";

const SUB_PHASES = ["Project", "Design", "Meetings", "Internal Meetings"];

const PHASE_SUGGESTIONS = [
  "Discovery", "Vision", "Brand Identity", "Brand Standards",
  "City Submittal", "Schematic Design", "Design Development",
  "Construction Documents", "Permitting", "Bidding", "Construction Administration",
];

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
    partial: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    unpaid:  "bg-red-500/10 text-red-500 border-red-500/20",
  };
  const labels: Record<string, string> = { paid: "Paid", partial: "Partial Payment", unpaid: "Unpaid" };
  return (
    <Badge variant="outline" className={`gap-1.5 ${m[status] || m.unpaid}`}>
      <DollarSign className="h-3.5 w-3.5" /> {labels[status] || "Unpaid"}
    </Badge>
  );
}

function PhaseCard({
  phase,
  timeblocks,
  onToggleEnabled,
  onUpdateHours,
  onDelete,
}: {
  phase: any;
  timeblocks: any[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onUpdateHours: (id: string, hours: number) => void;
  onDelete: (id: string) => void;
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
              phase.status === "in_progress" ? "bg-blue-500/10 text-blue-500" :
              "bg-muted text-muted-foreground"
            }`}>
              {phase.status?.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
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

          {/* Enabled toggle */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground">In Scope</span>
            <Switch
              checked={phase.enabled}
              onCheckedChange={(v) => onToggleEnabled(phase.id, v)}
            />
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(phase.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      {!isDisabled && phase.budgetedHours > 0 && (
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useGetProject(id || "");
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

  const updateTimeBlock = useUpdateTimeBlock();
  const updateProject = useUpdateProject();

  // Add phase state
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseHours, setNewPhaseHours] = useState("0");
  const [showAddPhase, setShowAddPhase] = useState(false);

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
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="outline" className="uppercase">{project.status?.replace("_", " ")}</Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <NTPBadge received={(project as any).ntpReceived} />
            <PaymentBadge status={(project as any).paymentStatus} />
          </div>
        </div>
        <p className="text-muted-foreground">{(project as any).clientName || "Internal Project"}</p>
      </div>

      {/* Summary stats */}
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

      <Tabs defaultValue="phases" className="w-full">
        <TabsList className="bg-muted/20">
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="time">Time Logs</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* PHASES TAB */}
        <TabsContent value="phases" className="mt-5">
          <div className="flex flex-col gap-3">
            {sortedPhases.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No phases defined for this project yet.</p>
                <Button onClick={() => setShowAddPhase(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add First Phase
                </Button>
              </Card>
            ) : (
              <>
                {/* Phase suggestion chips */}
                <div className="flex flex-wrap gap-1.5">
                  {PHASE_SUGGESTIONS.filter((s) => !usedSuggestions.has(s.toLowerCase())).slice(0, 6).map((s) => (
                    <button key={s}
                      onClick={() => addPhaseMutation.mutate({ name: s, budgetedHours: 0 })}
                      className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors">
                      + {s}
                    </button>
                  ))}
                </div>

                {sortedPhases.map((phase: any) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    timeblocks={timeblocks as any[]}
                    onToggleEnabled={(phId, enabled) => updatePhaseMutation.mutate({ id: phId, enabled })}
                    onUpdateHours={(phId, budgetedHours) => {
                      updatePhaseMutation.mutate({ id: phId, budgetedHours });
                      // Recalculate project total
                      const newTotal = sortedPhases.reduce((sum: number, p: any) =>
                        sum + (p.id === phId ? budgetedHours : p.budgetedHours), 0);
                      updateProject.mutate({ id: project.id, data: { budgetedHours: newTotal } as any });
                    }}
                    onDelete={(phId) => deletePhaseMutation.mutate(phId)}
                  />
                ))}
              </>
            )}

            {/* Add phase */}
            {showAddPhase ? (
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
                  <TableHead>Approved</TableHead>
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
                    <TableCell>
                      <button onClick={() => handleApproveTime(tb.id, !tb.approved)}>
                        {tb.approved
                          ? <Check className="h-4 w-4 text-emerald-500" />
                          : <X className="h-4 w-4 text-muted-foreground" />}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {(timeblocks as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No time logged yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* EXPENSES TAB */}
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

        {/* INVOICES TAB */}
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

        {/* SETTINGS TAB */}
        <TabsContent value="settings" className="mt-5">
          <div className="grid gap-4 max-w-md">
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
