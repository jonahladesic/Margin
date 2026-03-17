import { useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { 
  useListAllocations, 
  useListTimeBlocks,
  useCreateTimeBlock
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Calendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);

  const [formData, setFormData] = useState({
    projectId: "",
    date: format(new Date(), "yyyy-MM-dd"),
    hours: "1",
    type: "work",
    description: ""
  });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const { data: allocations = [] } = useListAllocations({
    query: {
      queryKey: ["allocations", user?.id],
    },
    request: {
      query: {
        userId: user?.id,
      }
    }
  });

  const { data: timeblocks = [] } = useListTimeBlocks({
    query: {
      queryKey: ["timeblocks", user?.id, weekStart.toISOString()],
    },
    request: {
      query: {
        userId: user?.id,
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
      }
    }
  });

  const createTimeBlock = useCreateTimeBlock();

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const today = () => setCurrentDate(new Date());

  const handleLogTime = () => {
    if (!user || !formData.projectId) return;

    createTimeBlock.mutate({
      data: {
        userId: user.id,
        projectId: formData.projectId,
        date: new Date(formData.date).toISOString(),
        hours: Number(formData.hours),
        type: formData.type as any,
        description: formData.description
      }
    }, {
      onSuccess: () => {
        toast({ title: "Time logged successfully" });
        setIsLogTimeOpen(false);
        queryClient.invalidateQueries({ queryKey: ["timeblocks"] });
      },
      onError: () => {
        toast({ title: "Failed to log time", variant: "destructive" });
      }
    });
  };

  const totalLoggedThisWeek = timeblocks.reduce((acc, tb) => acc + tb.hours, 0);

  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 13 }).map((_, i) => i + 8); // 8am to 8pm

  // Deduplicate projects for dropdown
  const uniqueProjects = Array.from(new Map(allocations.map(a => [a.projectId, a])).values());

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
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
          <Button variant="outline" size="sm" onClick={today}>This Week</Button>
        </div>
        
        <Dialog open={isLogTimeOpen} onOpenChange={setIsLogTimeOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Log Time
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Time</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select value={formData.projectId} onValueChange={v => setFormData({...formData, projectId: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Project" /></SelectTrigger>
                  <SelectContent>
                    {uniqueProjects.map(a => (
                      <SelectItem key={a.projectId} value={a.projectId}>{a.projectName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <Label>Hours</Label>
                  <Input type="number" min="0.5" step="0.5" value={formData.hours} onChange={e => setFormData({...formData, hours: e.target.value})} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Work</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="kickoff">Kickoff</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="page_turn">Page Turn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="What did you work on?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLogTimeOpen(false)}>Cancel</Button>
              <Button onClick={handleLogTime} disabled={createTimeBlock.isPending || !formData.projectId}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between bg-card p-4 rounded-xl border">
        <div className="flex flex-col gap-1 w-full max-w-sm">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-muted-foreground">Weekly Target</span>
            <span className="font-bold">{totalLoggedThisWeek} / 40 hrs</span>
          </div>
          <Progress 
            value={Math.min((totalLoggedThisWeek / 40) * 100, 100)} 
            className="h-2" 
            indicatorClassName={totalLoggedThisWeek > 40 ? "bg-destructive" : "bg-primary"}
          />
        </div>
      </div>

      <div className="flex flex-1 gap-6 min-h-0">
        <div className="w-80 flex flex-col gap-4 overflow-y-auto pr-2">
          <h3 className="font-semibold text-lg">My Allocations</h3>
          {allocations.map(alloc => {
            const percent = alloc.allocatedHours > 0 ? Math.min((alloc.loggedHours / alloc.allocatedHours) * 100, 100) : 0;
            return (
              <Card key={alloc.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="font-medium">{alloc.projectName}</div>
                  {alloc.projectColor && (
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: alloc.projectColor }} />
                  )}
                </div>
                {alloc.phaseName && <div className="text-sm text-muted-foreground">{alloc.phaseName}</div>}
                
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{alloc.loggedHours}h logged</span>
                    <span>{alloc.allocatedHours}h total</span>
                  </div>
                  <Progress value={percent} className="h-1.5" />
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-2"
                  onClick={() => {
                    setFormData({...formData, projectId: alloc.projectId});
                    setIsLogTimeOpen(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-2" /> Add Time
                </Button>
              </Card>
            );
          })}
          {allocations.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
              No allocations this week.
            </div>
          )}
        </div>

        <div className="flex-1 bg-card border rounded-xl overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b bg-muted/20">
            {days.map((day, i) => (
              <div key={i} className="p-3 text-center border-r last:border-0">
                <div className="text-sm text-muted-foreground mb-1">{format(day, "EEE")}</div>
                <div className={`text-xl font-medium ${isSameDay(day, new Date()) ? "text-primary bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center mx-auto" : ""}`}>
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex-1 overflow-y-auto relative">
            <div className="grid grid-cols-7 h-[800px]">
              {days.map((day, dIdx) => (
                <div key={dIdx} className="border-r last:border-0 relative">
                  {hours.map((_, hIdx) => (
                    <div key={hIdx} className="border-b h-[61px] opacity-10" />
                  ))}
                  
                  {timeblocks.filter(tb => isSameDay(new Date(tb.date), day)).map((tb, idx) => (
                    <div 
                      key={tb.id} 
                      className={`absolute left-1 right-1 p-2 rounded-md text-xs border shadow-sm ${
                        tb.type === 'kickoff' ? 'border-green-500 bg-green-500/10' : 
                        tb.type === 'deadline' ? 'border-red-500 bg-red-500/10' : 
                        tb.type === 'page_turn' ? 'border-purple-500 bg-purple-500/10' : 
                        'bg-background'
                      }`}
                      style={{
                        top: `${idx * (tb.hours * 60 + 5) + 10}px`, // Simple stacking for overlapping time blocks
                        height: `${tb.hours * 60}px`,
                        borderLeftWidth: '4px',
                        borderLeftColor: tb.type === 'work' || tb.type === 'meeting' ? (tb.projectColor || 'var(--primary)') : undefined,
                      }}
                    >
                      <div className="font-semibold truncate">{tb.projectName}</div>
                      <div className="text-muted-foreground">{tb.hours}h {tb.type !== 'work' ? ` - ${tb.type.replace('_', ' ')}` : ''}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
