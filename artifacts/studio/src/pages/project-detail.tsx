import { useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Check, X, Plus } from "lucide-react";
import {
  useGetProject,
  useListTimeBlocks,
  useListExpenses,
  useListInvoices,
  useUpdateTimeBlock,
  useUpdateExpense,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPM = user?.role === "pm" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const { data: project, isLoading: projectLoading } = useGetProject(id || "");
  const { data: timeblocks = [] } = useListTimeBlocks({ request: { query: { projectId: id } } });
  const { data: expenses = [] } = useListExpenses({ request: { query: { projectId: id } } });
  const { data: invoices = [] } = useListInvoices({ request: { query: { projectId: id } } });

  const updateTimeBlock = useUpdateTimeBlock();
  const updateExpense = useUpdateExpense();

  const handleApproveTime = (tbId: string, approved: boolean) => {
    updateTimeBlock.mutate(
      { id: tbId, data: { approved } },
      {
        onSuccess: () => {
          toast({ title: approved ? "Time approved" : "Time unapproved" });
          queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
        },
      }
    );
  };

  const handleApproveExpense = (expId: string, approved: boolean) => {
    updateExpense.mutate(
      { id: expId, data: { approved } },
      {
        onSuccess: () => {
          toast({ title: approved ? "Expense approved" : "Expense rejected" });
          queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        },
      }
    );
  };

  if (projectLoading) {
    return <div className="p-8 text-muted-foreground">Loading project...</div>;
  }

  if (!project) {
    return <div className="p-8 text-destructive">Project not found</div>;
  }

  const hoursPercent = project.budgetedHours > 0 ? (project.loggedHours / project.budgetedHours) * 100 : 0;
  const isOverBudget = hoursPercent > 90;

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color || 'var(--primary)' }} />
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <Badge variant="outline" className="ml-2 uppercase">{project.status.replace('_', ' ')}</Badge>
          <Badge variant="secondary" className="uppercase">{project.type}</Badge>
        </div>
        <p className="text-muted-foreground text-lg">{project.clientName || 'Internal Project'}</p>
        
        {project.startDate && project.endDate && (
          <p className="text-sm text-muted-foreground">
            {format(new Date(project.startDate), "MMM d, yyyy")} – {format(new Date(project.endDate), "MMM d, yyyy")}
          </p>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-muted/20">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="time">Time Logs</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 flex flex-col gap-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6 border-l-4" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="text-sm font-medium text-muted-foreground mb-1">Budgeted Hours</div>
              <div className="text-3xl font-bold">{project.budgetedHours}h</div>
            </Card>
            <Card className={`p-6 border-l-4 ${isOverBudget ? 'border-destructive' : 'border-emerald-500'}`}>
              <div className="text-sm font-medium text-muted-foreground mb-1">Logged Hours</div>
              <div className="text-3xl font-bold">{project.loggedHours}h</div>
              <Progress value={Math.min(hoursPercent, 100)} className="h-1.5 mt-3" indicatorClassName={isOverBudget ? "bg-destructive" : "bg-emerald-500"} />
            </Card>
            <Card className="p-6 border-l-4 border-blue-500">
              <div className="text-sm font-medium text-muted-foreground mb-1">Budget Amount</div>
              <div className="text-3xl font-bold">${project.budgetAmount?.toLocaleString() || '0'}</div>
            </Card>
            <Card className="p-6 border-l-4 border-amber-500">
              <div className="text-sm font-medium text-muted-foreground mb-1">Billed Amount</div>
              <div className="text-3xl font-bold">${project.billedAmount?.toLocaleString() || '0'}</div>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Phases</h2>
              {isPM && <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4"/> Add Phase</Button>}
            </div>
            <Card className="p-0 overflow-hidden">
              <div className="p-8 text-center text-muted-foreground">No phases defined for this project.</div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="time" className="mt-6">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  {isPM && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeblocks.map(tb => (
                  <TableRow key={tb.id}>
                    <TableCell>{format(new Date(tb.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{tb.userName}</TableCell>
                    <TableCell className="font-medium">{tb.hours}h</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-[10px]">{tb.type.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="max-w-[300px] truncate">{tb.description || '-'}</TableCell>
                    <TableCell>
                      {tb.approved ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-transparent">Approved</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-transparent">Pending</Badge>
                      )}
                    </TableCell>
                    {isPM && (
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleApproveTime(tb.id, !tb.approved)}
                        >
                          {tb.approved ? 'Unapprove' : 'Approve'}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {timeblocks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No time logged.</TableCell>
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
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Billable</TableHead>
                  <TableHead>Status</TableHead>
                  {isPM && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>{format(new Date(exp.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{exp.userName}</TableCell>
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
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-emerald-500"
                          onClick={() => handleApproveExpense(exp.id, true)}
                          disabled={exp.approved}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleApproveExpense(exp.id, false)}
                          disabled={!exp.approved}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No expenses recorded.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6">
          <div className="flex justify-end mb-4">
            {isAdmin && <Button><Plus className="mr-2 h-4 w-4"/> Create Invoice</Button>}
          </div>
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
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                    <TableCell>{format(new Date(inv.issueDate), "MMM d, yyyy")}</TableCell>
                    <TableCell>{format(new Date(inv.dueDate), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right font-medium">${inv.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">{inv.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
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
