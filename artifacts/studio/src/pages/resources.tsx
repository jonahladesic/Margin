import { useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useListAllocations, useListTimeBlocks, useListProjects,
  useCreateAllocation, useListProjectPhases,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_ALLOC = {
  projectId: "", phaseId: "", allocatedHours: "", startDate: "", endDate: "", notes: "",
};

export default function Resources() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignUserName, setAssignUserName] = useState("");
  const [allocForm, setAllocForm] = useState({ ...DEFAULT_ALLOC });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  const { data: projects = [] } = useListProjects();
  const createAllocation = useCreateAllocation();

  // Fetch phases for selected project
  const { data: phases = [] } = useListProjectPhases(allocForm.projectId || "none", {
    query: { enabled: !!allocForm.projectId } as any,
  });

  const setAlloc = (k: string, v: any) => setAllocForm((f) => ({ ...f, [k]: v }));

  const openAssignDialog = (userId: string, userName: string) => {
    setAssignUserId(userId);
    setAssignUserName(userName);
    setAllocForm({
      ...DEFAULT_ALLOC,
      startDate: format(weekStart, "yyyy-MM-dd"),
      endDate: format(weekEnd, "yyyy-MM-dd"),
    });
    setAssignDialogOpen(true);
  };

  const handleCreateAllocation = () => {
    if (!allocForm.projectId || !allocForm.allocatedHours || !allocForm.startDate || !allocForm.endDate) {
      toast({ title: "Please fill in project, hours, and dates", variant: "destructive" });
      return;
    }
    createAllocation.mutate(
      {
        data: {
          userId: assignUserId,
          projectId: allocForm.projectId,
          phaseId: allocForm.phaseId || undefined,
          allocatedHours: Number(allocForm.allocatedHours),
          startDate: allocForm.startDate,
          endDate: allocForm.endDate,
          notes: allocForm.notes || undefined,
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: `Hours assigned to ${assignUserName}` });
          setAssignDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/utilization"] });
          queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
        },
        onError: () => toast({ title: "Failed to create allocation", variant: "destructive" }),
      }
    );
  };

  // Using custom fetch for utilization to match API endpoint since it might not be a generated hook
  const { data: utilizations = [], isLoading } = useQuery({
    queryKey: ["/api/utilization", weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString()
      });
      const res = await fetch(`/api/utilization?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch utilizations");
      return res.json() as Promise<any[]>;
    }
  });

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Allocation</h1>
          <p className="text-muted-foreground mt-1">Manage team capacity and assignments.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-card rounded-md border p-1 shadow-sm">
          <Button variant="ghost" size="icon" onClick={prevWeek} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-48 text-center">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={nextWeek} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-[250px_1fr] border-b bg-muted/30 p-4 text-sm font-medium text-muted-foreground">
          <div>Team Member</div>
          <div>Weekly Allocation</div>
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading utilization data...</div>
        ) : utilizations.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No resources found.</div>
        ) : (
          <div className="divide-y">
            {utilizations.map((u: any) => {
              const isOver = u.status === 'over';
              const isUnder = u.status === 'under';
              
              return (
                <div key={u.userId} className="grid grid-cols-[250px_1fr] p-4 items-center gap-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={u.profileImage} />
                      <AvatarFallback>{u.userName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-semibold">{u.userName}</span>
                      <span className={`text-xs font-medium ${isOver ? 'text-destructive' : isUnder ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {u.allocatedHours} / {u.targetHours}h allocated
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Progress 
                      value={Math.min((u.allocatedHours / u.targetHours) * 100, 100)} 
                      className="h-3"
                      indicatorClassName={isOver ? 'bg-destructive' : isUnder ? 'bg-amber-500' : 'bg-emerald-500'} 
                    />
                    
                    <div className="flex flex-wrap gap-2 mt-1">
                      {u.projects?.map((p: any) => (
                        <div 
                          key={p.projectId}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border bg-background font-medium shadow-xs"
                          style={{ borderColor: p.projectColor || 'var(--border)' }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.projectColor || 'var(--primary)' }} />
                          {p.projectName} ({p.allocatedHours}h)
                        </div>
                      ))}
                      <Button
                        variant="outline" size="sm"
                        className="h-6 text-xs px-2 no-default-hover-elevate"
                        onClick={() => openAssignDialog(u.userId, u.userName)}
                      >
                        + Assign
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Assign Allocation Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Hours</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Team Member</Label>
              <Input value={assignUserName} disabled className="bg-muted/50" />
            </div>
            <div className="grid gap-2">
              <Label>Project *</Label>
              <Select
                value={allocForm.projectId || "none"}
                onValueChange={(v) => {
                  setAlloc("projectId", v === "none" ? "" : v);
                  setAlloc("phaseId", "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a project</SelectItem>
                  {(projects as any[]).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {allocForm.projectId && (phases as any[]).length > 0 && (
              <div className="grid gap-2">
                <Label>Phase</Label>
                <Select value={allocForm.phaseId || "none"} onValueChange={(v) => setAlloc("phaseId", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="All phases" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All phases</SelectItem>
                    {(phases as any[]).map((ph: any) => (
                      <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Allocated Hours *</Label>
              <Input
                type="number" min="1" step="0.5" placeholder="e.g. 20"
                value={allocForm.allocatedHours}
                onChange={(e) => setAlloc("allocatedHours", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Start Date *</Label>
                <Input type="date" value={allocForm.startDate} onChange={(e) => setAlloc("startDate", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>End Date *</Label>
                <Input type="date" value={allocForm.endDate} onChange={(e) => setAlloc("endDate", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input
                placeholder="Optional notes"
                value={allocForm.notes}
                onChange={(e) => setAlloc("notes", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateAllocation}
              disabled={createAllocation.isPending || !allocForm.projectId || !allocForm.allocatedHours}
            >
              {createAllocation.isPending ? "Assigning…" : "Assign Hours"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
