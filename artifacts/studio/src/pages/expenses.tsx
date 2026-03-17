import { format } from "date-fns";
import { Check, X, Plus } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { 
  useListExpenses,
  useUpdateExpense
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Expenses() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPM = user?.role === "pm" || user?.role === "admin";
  const { data: expenses = [], isLoading } = useListExpenses();
  const updateExpense = useUpdateExpense();

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
        <Button>
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
    </div>
  );
}
