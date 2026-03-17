import { useState } from "react";
import { format } from "date-fns";
import { Plus, Download, FileText, CheckCircle2 } from "lucide-react";
import { 
  useListInvoices,
  useUpdateInvoice
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export default function Invoices() {
  const [filter, setFilter] = useState("all");
  const { data: invoices = [], isLoading } = useListInvoices();
  const updateInvoice = useUpdateInvoice();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusUpdate = (id: string, newStatus: any) => {
    updateInvoice.mutate({
      id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: `Invoice marked as ${newStatus}` });
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-transparent">PAID</Badge>;
      case 'sent': return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-transparent">SENT</Badge>;
      case 'overdue': return <Badge variant="outline" className="bg-destructive/10 text-destructive border-transparent">OVERDUE</Badge>;
      case 'draft': return <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">DRAFT</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const filteredInvoices = filter === "all" ? invoices : invoices.filter(i => i.status === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage billing and payments.</p>
        </div>
        
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      <Card className="border shadow-sm bg-card overflow-hidden">
        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <div className="px-4 py-3 border-b bg-muted/20">
            <TabsList className="bg-background/50">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[120px]">Invoice</TableHead>
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
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center gap-2">
                      <FileText className="h-8 w-8 opacity-20" />
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium text-foreground">{invoice.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{invoice.projectName}</div>
                        <div className="text-xs text-muted-foreground">{invoice.clientName}</div>
                      </TableCell>
                      <TableCell>{format(new Date(invoice.issueDate), "MMM d, yyyy")}</TableCell>
                      <TableCell>{format(new Date(invoice.dueDate), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">${invoice.total.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" title="Download PDF">
                            <Download className="h-4 w-4" />
                          </Button>
                          {invoice.status === 'draft' && (
                            <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(invoice.id, 'sent')}>
                              Mark Sent
                            </Button>
                          )}
                          {invoice.status === 'sent' && (
                            <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(invoice.id, 'paid')} className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 hover:text-emerald-600">
                              <CheckCircle2 className="mr-1.5 h-3 w-3" />
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
          </div>
        </Tabs>
      </Card>
    </div>
  );
}
