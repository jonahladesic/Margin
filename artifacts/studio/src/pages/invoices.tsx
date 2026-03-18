import { useState } from "react";
import { format } from "date-fns";
import { Plus, Download, FileText, CheckCircle2, FolderPlus } from "lucide-react";
import {
  useListInvoices, useUpdateInvoice, useCreateProject, useListClients,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PROJECT_COLORS = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

const DEFAULT_PROJ = {
  name: "", clientId: "", type: "branding", budgetedHours: "100",
  budgetAmount: "10000", color: "#4f46e5", ntpReceived: false,
  ntpDate: "", paymentStatus: "unpaid",
};

export default function Invoices() {
  const [filter, setFilter] = useState("all");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projForm, setProjForm] = useState({ ...DEFAULT_PROJ });

  const { data: invoices = [], isLoading } = useListInvoices();
  const { data: clients = [] } = useListClients();
  const updateInvoice = useUpdateInvoice();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const setP = (k: string, v: any) => setProjForm((f) => ({ ...f, [k]: v }));

  const handleStatusUpdate = (id: string, newStatus: any) => {
    updateInvoice.mutate({ id, data: { status: newStatus } }, {
      onSuccess: () => {
        toast({ title: `Invoice marked as ${newStatus}` });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      },
    });
  };

  const handleCreateProject = () => {
    if (!projForm.name) return;
    createProject.mutate(
      {
        data: {
          name: projForm.name,
          clientId: projForm.clientId || undefined,
          type: projForm.type as any,
          budgetedHours: Number(projForm.budgetedHours),
          budgetAmount: Number(projForm.budgetAmount),
          color: projForm.color,
          status: "active" as any,
          ntpReceived: projForm.ntpReceived,
          ntpDate: projForm.ntpDate || undefined,
          paymentStatus: projForm.paymentStatus as any,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Project created from billing" });
          setNewProjectOpen(false);
          setProjForm({ ...DEFAULT_PROJ });
          queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        },
        onError: () => toast({ title: "Failed to create project", variant: "destructive" }),
      }
    );
  };

  const getStatusBadge = (status: string) => {
    const m: Record<string, string> = {
      paid:    "bg-emerald-500/10 text-emerald-500",
      sent:    "bg-blue-500/10 text-blue-500",
      overdue: "bg-destructive/10 text-destructive",
      draft:   "bg-muted text-muted-foreground",
    };
    return (
      <Badge variant="outline" className={`border-transparent uppercase text-[11px] ${m[status] || m.draft}`}>
        {status}
      </Badge>
    );
  };

  const filteredInvoices = filter === "all" ? (invoices as any[]) : (invoices as any[]).filter((i) => i.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices & Billing</h1>
          <p className="text-muted-foreground mt-1">Manage billing, payments, and project financials.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setNewProjectOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Project
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Invoice
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/20">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="bg-background/50">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="w-[120px]">Invoice #</TableHead>
              <TableHead>Project / Client</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FileText className="h-10 w-10 opacity-20" />
                    <p>No invoices found</p>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-2 h-4 w-4" />Create Invoice
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice: any) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                  <TableCell>
                    <div className="font-medium">{invoice.projectName}</div>
                    <div className="text-xs text-muted-foreground">{invoice.clientName}</div>
                  </TableCell>
                  <TableCell>{format(new Date(invoice.issueDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{format(new Date(invoice.dueDate), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">${invoice.total?.toLocaleString()}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Download PDF">
                        <Download className="h-4 w-4" />
                      </Button>
                      {invoice.status === "draft" && (
                        <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(invoice.id, "sent")}>
                          Mark Sent
                        </Button>
                      )}
                      {invoice.status === "sent" && (
                        <Button
                          variant="outline" size="sm"
                          className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                          onClick={() => handleStatusUpdate(invoice.id, "paid")}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={newProjectOpen} onOpenChange={setNewProjectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Project from Billing</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Project Name *</Label>
              <Input value={projForm.name} onChange={(e) => setP("name", e.target.value)} placeholder="e.g. Acme Brand Identity" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select value={projForm.clientId} onValueChange={(v) => setP("clientId", v)}>
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
                <Select value={projForm.type} onValueChange={(v) => setP("type", v)}>
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
                <Label>Budget Hours</Label>
                <Input type="number" value={projForm.budgetedHours} onChange={(e) => setP("budgetedHours", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Budget ($)</Label>
                <Input type="number" value={projForm.budgetAmount} onChange={(e) => setP("budgetAmount", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button key={c} className={`w-6 h-6 rounded-full border-2 ${projForm.color === c ? "border-white" : "border-transparent"}`}
                    style={{ backgroundColor: c }} onClick={() => setP("color", c)} />
                ))}
              </div>
            </div>
            <div className="border-t pt-4 grid gap-3">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Billing</p>
              <div className="flex items-center justify-between">
                <div>
                  <Label>NTP Received</Label>
                  <p className="text-xs text-muted-foreground">Notice to Proceed from client</p>
                </div>
                <Switch checked={projForm.ntpReceived} onCheckedChange={(v) => setP("ntpReceived", v)} />
              </div>
              {projForm.ntpReceived && (
                <div className="grid gap-2">
                  <Label>NTP Date</Label>
                  <Input type="date" value={projForm.ntpDate} onChange={(e) => setP("ntpDate", e.target.value)} />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Payment Status</Label>
                <Select value={projForm.paymentStatus} onValueChange={(v) => setP("paymentStatus", v)}>
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
            <Button variant="outline" onClick={() => setNewProjectOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={createProject.isPending || !projForm.name}>
              {createProject.isPending ? "Creating…" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
