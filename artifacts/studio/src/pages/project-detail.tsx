import { useState } from "react";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { ChevronLeft, FileCheck, DollarSign, Clock, Plus, Check, X } from "lucide-react";
import {
  useGetProject, useListTimeBlocks, useListExpenses, useListInvoices,
  useUpdateTimeBlock, useUpdateExpense, useUpdateProject,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PHASES = ["Discovery", "Vision", "Brand Identity", "Brand Standards"];
const SUB_PHASES = ["Project", "Design", "Meetings", "Internal Meetings"];

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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projectLoading } = useGetProject(id || "");
  const { data: timeblocks = [] } = useListTimeBlocks({ request: { query: { projectId: id } } });
  const { data: expenses = [] } = useListExpenses({ request: { query: { projectId: id } } });
  const { data: invoices = [] } = useListInvoices({ request: { query: { projectId: id } } });

  const { data: phases = [] } = useQuery({
    queryKey: ["/api/projects", id, "phases"],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${id}/phases`);
      return r.json();
    },
    enabled: !!id,
  });

  const updateTimeBlock = useUpdateTimeBlock();
  const updateExpense = useUpdateExpense();
  const updateProject = useUpdateProject();

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
    updateProject.mutate(
      { id: project.id, data: { ntpReceived } as any },
      {
        onSuccess: () => {
          toast({ title: ntpReceived ? "NTP marked received" : "NTP cleared" });
          queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
        },
      }
    );
  };

  const handlePaymentStatus = (paymentStatus: string) => {
    if (!project) return;
    updateProject.mutate(
      { id: project.id, data: { paymentStatus } as any },
      {
        onSuccess: () => {
          toast({ title: `Payment status updated to ${paymentStatus}` });
          queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
        },
      }
    );
  };

  if (projectLoading) {
    return <div className="p-8 text-muted-foreground">Loading project…</div>;
  }
  if (!project) {
    return <div className="p-8 text-destructive">Project not found</div>;
  }

  const hoursPercent = project.budgetedHours > 0
    ? ((project as any).loggedHours / project.budgetedHours) * 100 : 0;
  const isOver = hoursPercent > 90;

  const getPhaseTimeblocks = (phaseName: string) => {
    const phase = (phases as any[]).find((p) => p.name === phaseName);
    if (!phase) return [];
    return (timeblocks as any[]).filter((tb) => tb.phaseId === phase.id);
  };

  const getPhaseHours = (phaseName: string) => {
    return getPhaseTimeblocks(phaseName).reduce((acc: number, tb: any) => acc + tb.hours, 0);
  };

  const getSubPhaseHours = (phaseName: string, subPhase: string) => {
    return getPhaseTimeblocks(phaseName)
      .filter((tb: any) => tb.subPhase === subPhase)
      .reduce((acc: number, tb: any) => acc + tb.hours, 0);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Projects
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: project.color || "var(--primary)" }} />
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant="outline" className="uppercase">{project.status?.replace("_", " ")}</Badge>
          </div>
          <div className="flex gap-2">
            <NTPBadge received={(project as any).ntpReceived} />
            <PaymentBadge status={(project as any).paymentStatus} />
          </div>
        </div>
        <p className="text-muted-foreground">{(project as any).clientName || "Internal Project"}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Hours Logged</div>
          <div className={`text-2xl font-bold mt-1 ${isOver ? "text-destructive" : ""}`}>
            {(project as any).loggedHours} <span className="text-sm font-normal text-muted-foreground">/ {project.budgetedHours}</span>
          </div>
          <Progress value={Math.min(hoursPercent, 100)} className="h-1.5 mt-2" />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Budget</div>
          <div className="text-2xl font-bold mt-1">
            {project.budgetAmount ? `$${Number(project.budgetAmount).toLocaleString()}` : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">NTP Status</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm">{(project as any).ntpReceived ? "Received" : "Pending"}</span>
            <Switch
              checked={(project as any).ntpReceived}
              onCheckedChange={handleToggleNTP}
            />
          </div>
          {(project as any).ntpDate && (
            <div className="text-xs text-muted-foreground mt-1">{(project as any).ntpDate}</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Payment</div>
          <div className="mt-2">
            <Select value={(project as any).paymentStatus} onValueChange={handlePaymentStatus}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="phases" className="w-full">
        <TabsList className="bg-muted/20">
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="time">Time Logs</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="phases" className="mt-6">
          <div className="grid gap-6">
            {PHASES.map((phaseName) => {
              const phase = (phases as any[]).find((p) => p.name === phaseName);
              const phaseHours = getPhaseHours(phaseName);
              return (
                <Card key={phaseName} className="overflow-hidden">
                  <div className="p-5 border-b bg-muted/10 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-base">{phaseName}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {phaseHours}h logged {phase ? `· ${phase.status}` : "· not started"}
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      phase?.status === "completed" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                      phase?.status === "in_progress" ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                      "bg-muted text-muted-foreground"
                    }>
                      {phase?.status?.replace("_", " ") || "Upcoming"}
                    </Badge>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {SUB_PHASES.map((sp) => {
                      const hrs = getSubPhaseHours(phaseName, sp);
                      return (
                        <div key={sp} className="bg-background rounded-lg border p-3">
                          <div className="text-xs text-muted-foreground mb-1">{sp}</div>
                          <div className="text-xl font-bold">{hrs}h</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="time" className="mt-6">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Person</TableHead>
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
                    <TableCell>{tb.date}</TableCell>
                    <TableCell className="text-muted-foreground">{tb.userName}</TableCell>
                    <TableCell>{tb.phaseName || "—"}</TableCell>
                    <TableCell>{tb.subPhase || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{tb.hours}h</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{tb.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleApproveTime(tb.id, !tb.approved)}>
                          {tb.approved ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(timeblocks as any[]).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No time logged yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Approved</TableHead>
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
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No expenses recorded.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
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
                    <TableCell>
                      <Badge variant="outline" className="uppercase">{inv.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(invoices as any[]).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No invoices generated.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
