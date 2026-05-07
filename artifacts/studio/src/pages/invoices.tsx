import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Plus, Download, FileText, CheckCircle2, FolderPlus, ArrowUpFromLine, Trash2, Pencil } from "lucide-react";
import {
  useListInvoices, useUpdateInvoice, useCreateProject, useListClients,
  useCreateInvoice, useListProjects,
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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PROJECT_COLORS = ["#f97316","#E8772E","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"];

const DEFAULT_PROJ = {
  name: "", clientId: "", type: "branding", budgetedHours: "100",
  budgetAmount: "10000", color: "#f97316", ntpReceived: false,
  ntpDate: "", paymentStatus: "unpaid",
};

export default function Invoices() {
  const [filter, setFilter] = useState("all");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projForm, setProjForm] = useState({ ...DEFAULT_PROJ });
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  const [editInvoiceForm, setEditInvoiceForm] = useState<any>(null);

  const DEFAULT_LINE_ITEM = { description: "", quantity: "1", unitPrice: "" };
  const DEFAULT_INVOICE = {
    projectId: "", issueDate: format(new Date(), "yyyy-MM-dd"),
    dueDate: "", taxRate: "0", notes: "",
    lineItems: [{ ...DEFAULT_LINE_ITEM }],
  };
  const [invoiceForm, setInvoiceForm] = useState({ ...DEFAULT_INVOICE });

  const { data: invoices = [], isLoading } = useListInvoices();
  const { data: clients = [] } = useListClients();
  const { data: projects = [] } = useListProjects();
  const updateInvoice = useUpdateInvoice();
  const createProject = useCreateProject();
  const createInvoice = useCreateInvoice();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Invoice form helpers ──
  const setInv = (k: string, v: any) => setInvoiceForm((f) => ({ ...f, [k]: v }));

  const updateLineItem = (idx: number, field: string, value: string) => {
    setInvoiceForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  };

  const addLineItem = () => {
    setInvoiceForm((f) => ({ ...f, lineItems: [...f.lineItems, { ...DEFAULT_LINE_ITEM }] }));
  };

  const removeLineItem = (idx: number) => {
    setInvoiceForm((f) => ({
      ...f,
      lineItems: f.lineItems.length > 1 ? f.lineItems.filter((_, i) => i !== idx) : f.lineItems,
    }));
  };

  const invoiceTotals = useMemo(() => {
    const subtotal = invoiceForm.lineItems.reduce((sum, item) => {
      return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const taxRate = Number(invoiceForm.taxRate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [invoiceForm.lineItems, invoiceForm.taxRate]);

  const handleCreateInvoice = () => {
    if (!invoiceForm.projectId || !invoiceForm.issueDate || !invoiceForm.dueDate) {
      toast({ title: "Please fill in project, issue date, and due date", variant: "destructive" });
      return;
    }
    if (invoiceForm.lineItems.every((li) => !li.description && !li.unitPrice)) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    createInvoice.mutate(
      {
        data: {
          projectId: invoiceForm.projectId,
          issueDate: invoiceForm.issueDate,
          dueDate: invoiceForm.dueDate,
          taxRate: Number(invoiceForm.taxRate) || 0,
          notes: invoiceForm.notes || undefined,
          lineItems: invoiceForm.lineItems
            .filter((li) => li.description || li.unitPrice)
            .map((li) => ({
              description: li.description,
              quantity: Number(li.quantity) || 1,
              unitPrice: Number(li.unitPrice) || 0,
            })),
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Invoice created" });
          setInvoiceDialogOpen(false);
          setInvoiceForm({ ...DEFAULT_INVOICE, lineItems: [{ ...DEFAULT_LINE_ITEM }] });
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        },
        onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
      }
    );
  };

  const handleDeleteInvoice = async () => {
    if (!deleteInvoiceId) return;
    try {
      await fetch(`/api/invoices/${deleteInvoiceId}`, { method: "DELETE" });
      toast({ title: "Invoice deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    } catch {
      toast({ title: "Failed to delete invoice", variant: "destructive" });
    }
    setDeleteInvoiceId(null);
  };

  // ── Edit Invoice ──
  const openEditInvoice = (invoice: any) => {
    setEditInvoiceId(invoice.id);
    setEditInvoiceForm({
      projectId: invoice.projectId,
      projectName: invoice.projectName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      taxRate: String(invoice.taxRate ?? 0),
      notes: invoice.notes || "",
      lineItems: (invoice.lineItems || []).map((li: any) => ({
        description: li.description || "",
        quantity: String(li.quantity || 1),
        unitPrice: String(li.unitPrice || 0),
      })),
    });
  };

  const setEditInv = (k: string, v: any) => setEditInvoiceForm((f: any) => ({ ...f, [k]: v }));

  const updateEditLineItem = (idx: number, field: string, value: string) => {
    setEditInvoiceForm((f: any) => ({
      ...f,
      lineItems: f.lineItems.map((item: any, i: number) => i === idx ? { ...item, [field]: value } : item),
    }));
  };

  const addEditLineItem = () => {
    setEditInvoiceForm((f: any) => ({ ...f, lineItems: [...f.lineItems, { ...DEFAULT_LINE_ITEM }] }));
  };

  const removeEditLineItem = (idx: number) => {
    setEditInvoiceForm((f: any) => ({
      ...f,
      lineItems: f.lineItems.length > 1 ? f.lineItems.filter((_: any, i: number) => i !== idx) : f.lineItems,
    }));
  };

  const editInvoiceTotals = useMemo(() => {
    if (!editInvoiceForm) return { subtotal: 0, taxAmount: 0, total: 0 };
    const subtotal = editInvoiceForm.lineItems.reduce((sum: number, item: any) => {
      return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const taxRate = Number(editInvoiceForm.taxRate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  }, [editInvoiceForm]);

  const handleSaveInvoice = () => {
    if (!editInvoiceId || !editInvoiceForm) return;
    updateInvoice.mutate(
      {
        id: editInvoiceId,
        data: {
          issueDate: editInvoiceForm.issueDate,
          dueDate: editInvoiceForm.dueDate,
          taxRate: Number(editInvoiceForm.taxRate) || 0,
          notes: editInvoiceForm.notes || undefined,
          lineItems: editInvoiceForm.lineItems
            .filter((li: any) => li.description || li.unitPrice)
            .map((li: any) => ({
              description: li.description,
              quantity: Number(li.quantity) || 1,
              unitPrice: Number(li.unitPrice) || 0,
            })),
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Invoice updated" });
          setEditInvoiceId(null);
          setEditInvoiceForm(null);
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        },
        onError: () => toast({ title: "Failed to update invoice", variant: "destructive" }),
      }
    );
  };

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
      sent:    "bg-orange-500/10 text-orange-500",
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
          <Button onClick={() => setInvoiceDialogOpen(true)}>
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
                    <Button variant="outline" size="sm" onClick={() => setInvoiceDialogOpen(true)}>
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
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {getStatusBadge(invoice.status)}
                      {invoice.coreInvoiceId && (
                        <Badge variant="outline" className="text-[10px] px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20">BQE</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Download PDF" onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {!invoice.coreInvoiceId && (
                        <Button
                          variant="ghost" size="icon" title="Send to BQE Core"
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/bqe/invoices/create", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ invoiceId: invoice.id }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                toast({ title: "Sent to BQE Core" });
                                queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
                              } else {
                                toast({ title: "BQE Error", description: data.error, variant: "destructive" });
                              }
                            } catch {
                              toast({ title: "Failed to send to BQE", variant: "destructive" });
                            }
                          }}
                        >
                          <ArrowUpFromLine className="h-4 w-4" />
                        </Button>
                      )}
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
                      {invoice.status === "draft" && (
                        <Button
                          variant="ghost" size="icon"
                          title="Edit invoice"
                          onClick={() => openEditInvoice(invoice)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete invoice"
                        onClick={() => setDeleteInvoiceId(invoice.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                <Select value={projForm.clientId || "none"} onValueChange={(v) => setP("clientId", v === "none" ? "" : v)}>
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

      {/* ── Create Invoice Dialog ── */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Project selector */}
            <div className="grid gap-2">
              <Label>Project *</Label>
              <Select value={invoiceForm.projectId || "none"} onValueChange={(v) => setInv("projectId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a project</SelectItem>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Issue Date *</Label>
                <Input type="date" value={invoiceForm.issueDate} onChange={(e) => setInv("issueDate", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Due Date *</Label>
                <Input type="date" value={invoiceForm.dueDate} onChange={(e) => setInv("dueDate", e.target.value)} />
              </div>
            </div>

            {/* Line items */}
            <div className="grid gap-2">
              <Label>Line Items</Label>
              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit Price</span>
                  <span className="text-right">Amount</span>
                  <span />
                </div>
                {invoiceForm.lineItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-1.5 border-t items-center">
                    <Input
                      placeholder="Service description"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number" min="1"
                      value={item.quantity}
                      onChange={(e) => updateLineItem(idx, "quantity", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={(e) => updateLineItem(idx, "unitPrice", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="text-right text-sm font-medium tabular-nums pr-1">
                      ${((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <button
                      onClick={() => removeLineItem(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                      disabled={invoiceForm.lineItems.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addLineItem} className="w-fit mt-1">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Line Item
              </Button>
            </div>

            {/* Tax rate */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Tax Rate (%)</Label>
                <Input
                  type="number" min="0" max="100" step="0.01"
                  value={invoiceForm.taxRate}
                  onChange={(e) => setInv("taxRate", e.target.value)}
                />
              </div>
              <div />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Payment terms, notes, etc."
                value={invoiceForm.notes}
                onChange={(e) => setInv("notes", e.target.value)}
                rows={2}
              />
            </div>

            {/* Totals */}
            <div className="border-t pt-3 flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-8">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums w-24 text-right">${invoiceTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {Number(invoiceForm.taxRate) > 0 && (
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Tax ({invoiceForm.taxRate}%)</span>
                  <span className="font-medium tabular-nums w-24 text-right">${invoiceTotals.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex gap-8 text-base font-bold border-t pt-1 mt-1">
                <span>Total</span>
                <span className="tabular-nums w-24 text-right">${invoiceTotals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateInvoice}
              disabled={createInvoice.isPending || !invoiceForm.projectId}
            >
              {createInvoice.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Invoice Confirmation ── */}
      <AlertDialog open={!!deleteInvoiceId} onOpenChange={(open) => !open && setDeleteInvoiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this invoice. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit Invoice Dialog ── */}
      <Dialog open={!!editInvoiceId} onOpenChange={(open) => { if (!open) { setEditInvoiceId(null); setEditInvoiceForm(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
          </DialogHeader>
          {editInvoiceForm && (
            <div className="grid gap-4 py-2">
              {/* Project (read-only) */}
              <div className="grid gap-2">
                <Label>Project</Label>
                <Input value={editInvoiceForm.projectName || ""} disabled className="bg-muted/50" />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Issue Date</Label>
                  <Input type="date" value={editInvoiceForm.issueDate} onChange={(e) => setEditInv("issueDate", e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={editInvoiceForm.dueDate} onChange={(e) => setEditInv("dueDate", e.target.value)} />
                </div>
              </div>

              {/* Line items */}
              <div className="grid gap-2">
                <Label>Line Items</Label>
                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground uppercase">
                    <span>Description</span>
                    <span>Qty</span>
                    <span>Unit Price</span>
                    <span className="text-right">Amount</span>
                    <span />
                  </div>
                  {editInvoiceForm.lineItems.map((item: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_100px_100px_40px] gap-2 px-3 py-1.5 border-t items-center">
                      <Input
                        placeholder="Service description"
                        value={item.description}
                        onChange={(e) => updateEditLineItem(idx, "description", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number" min="1"
                        value={item.quantity}
                        onChange={(e) => updateEditLineItem(idx, "quantity", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={item.unitPrice}
                        onChange={(e) => updateEditLineItem(idx, "unitPrice", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <div className="text-right text-sm font-medium tabular-nums pr-1">
                        ${((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <button
                        onClick={() => removeEditLineItem(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                        disabled={editInvoiceForm.lineItems.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addEditLineItem} className="w-fit mt-1">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Line Item
                </Button>
              </div>

              {/* Tax rate */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tax Rate (%)</Label>
                  <Input
                    type="number" min="0" max="100" step="0.01"
                    value={editInvoiceForm.taxRate}
                    onChange={(e) => setEditInv("taxRate", e.target.value)}
                  />
                </div>
                <div />
              </div>

              {/* Notes */}
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Payment terms, notes, etc."
                  value={editInvoiceForm.notes}
                  onChange={(e) => setEditInv("notes", e.target.value)}
                  rows={2}
                />
              </div>

              {/* Totals */}
              <div className="border-t pt-3 flex flex-col items-end gap-1 text-sm">
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums w-24 text-right">${editInvoiceTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {Number(editInvoiceForm.taxRate) > 0 && (
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Tax ({editInvoiceForm.taxRate}%)</span>
                    <span className="font-medium tabular-nums w-24 text-right">${editInvoiceTotals.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex gap-8 text-base font-bold border-t pt-1 mt-1">
                  <span>Total</span>
                  <span className="tabular-nums w-24 text-right">${editInvoiceTotals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditInvoiceId(null); setEditInvoiceForm(null); }}>Cancel</Button>
            <Button onClick={handleSaveInvoice} disabled={updateInvoice.isPending}>
              {updateInvoice.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
