import { useState } from "react";
import { format } from "date-fns";
import { Check, X, Plus } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useListExpenses, useUpdateExpense, useCreateExpense, useListProjects,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const EXPENSE_CATEGORIES = ["travel", "supplies", "software", "meals", "other"] as const;

const DEFAULT_EXPENSE = {
  projectId: "", description: "", amount: "",
  category: "other", date: format(new Date(), "yyyy-MM-dd"), billable: true,
};

export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ ...DEFAULT_EXPENSE });

  const isPM = user?.role === "pm" || user?.role === "admin";
  const { data: expenses = [], isLoading } = useListExpenses();
  const { data: projects = [] } = useListProjects();
  const updateExpense = useUpdateExpense();
  const createExpense = useCreateExpense();

  const setExp = (k: string, v: any) => setExpenseForm((f) => ({ ...f, [k]: v }));

  const handleCreateExpense = () => {
    if (!expenseForm.projectId || !expenseForm.description || !expenseForm.amount) {
      toast({ title: "Please fill in project, description, and amount", variant: "destructive" });
      return;
    }
    createExpense.mutate(
      {
        data: {
          projectId: expenseForm.projectId,
          userId: (user as any)?.id || "",
          description: expenseForm.description,
          amount: Number(expenseForm.amount),
          category: expenseForm.category as any,
          date: expenseForm.date,
          billable: expenseForm.billable,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Expense added" });
          setExpenseDialogOpen(false);
          setExpenseForm({ ...DEFAULT_EXPENSE });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        },
        onError: () => toast({ title: "Failed to add expense", variant: "destructive" }),
      }
    );
  };

  const handleApproveExpense = (id: string, approved: boolean) => {
    updateExpense.mutate(
      { id, data: { approved } },
      {
        onSuccess: () => {
          toast({ title: approved ? "Expense approved" : "Expense rejected" });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        },
      }
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground mt-1">Review and manage project expenses.</p>
        </div>
        <Button onClick={() => setExpenseDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </div>

      <Card className="border shadow-sm bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Billable</TableHead>
              <TableHead>Status</TableHead>
              {isPM && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No expenses found.</TableCell>
              </TableRow>
            ) : (
              expenses.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell>{format(new Date(exp.date), "MMM d, yyyy")}</TableCell>
                  <TableCell>{exp.userName}</TableCell>
                  <TableCell className="font-medium">{exp.projectName}</TableCell>
                  <TableCell className="capitalize">{exp.category}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{exp.description}</TableCell>
                  <TableCell className="text-right font-medium">${exp.amount.toLocaleString()}</TableCell>
                  <TableCell>{exp.billable ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    {exp.approved ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-transparent">Approved</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-transparent">Pending</Badge>
                    )}
                  </TableCell>
                  {isPM && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-emerald-500"
                          onClick={() => handleApproveExpense(exp.id, true)}
                          disabled={exp.approved}
                          title="Approve"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleApproveExpense(exp.id, false)}
                          disabled={!exp.approved}
                          title="Reject"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ── Add Expense Dialog ── */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Project *</Label>
              <Select value={expenseForm.projectId || "none"} onValueChange={(v) => setExp("projectId", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a project</SelectItem>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExp("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Description *</Label>
              <Input
                placeholder="What was this expense for?"
                value={expenseForm.description}
                onChange={(e) => setExp("description", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Amount ($) *</Label>
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={expenseForm.amount}
                  onChange={(e) => setExp("amount", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExp("date", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Billable</Label>
                <p className="text-xs text-muted-foreground">Charge this expense to the client</p>
              </div>
              <Switch checked={expenseForm.billable} onCheckedChange={(v) => setExp("billable", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateExpense}
              disabled={createExpense.isPending || !expenseForm.projectId || !expenseForm.description}
            >
              {createExpense.isPending ? "Adding…" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
