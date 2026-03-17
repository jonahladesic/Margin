import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Plus, MoreHorizontal } from "lucide-react";
import { 
  useListProjects,
  useCreateProject,
  useListClients
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Projects() {
  const { user } = useAuth();
  const { data: projects = [], isLoading } = useListProjects();
  const { data: clients = [] } = useListClients();
  const createProject = useCreateProject();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    clientId: "",
    status: "active",
    type: "web",
    budgetedHours: "100",
    budgetAmount: "10000",
    color: "#4f46e5"
  });

  const isPM = user?.role === "pm" || user?.role === "admin";

  const handleCreate = () => {
    createProject.mutate({
      data: {
        name: formData.name,
        clientId: formData.clientId || undefined,
        status: formData.status as any,
        type: formData.type as any,
        budgetedHours: Number(formData.budgetedHours),
        budgetAmount: Number(formData.budgetAmount),
        color: formData.color,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Project created" });
        setIsDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      },
      onError: (err: any) => {
        toast({ title: "Failed to create project", variant: "destructive" });
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30';
      case 'on_hold': return 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30';
      case 'cancelled': return 'bg-gray-500/20 text-gray-500 hover:bg-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-500 hover:bg-gray-500/30';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage all active and past studio projects.</p>
        </div>
        
        {isPM && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Project Name</Label>
                  <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Acme Website Redesign" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Client</Label>
                    <Select value={formData.clientId} onValueChange={v => setFormData({...formData, clientId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Client</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Web Design</SelectItem>
                        <SelectItem value="branding">Branding</SelectItem>
                        <SelectItem value="interior">Interior</SelectItem>
                        <SelectItem value="architecture">Architecture</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Budgeted Hours</Label>
                    <Input type="number" value={formData.budgetedHours} onChange={e => setFormData({...formData, budgetedHours: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Budget Amount ($)</Label>
                    <Input type="number" value={formData.budgetAmount} onChange={e => setFormData({...formData, budgetAmount: e.target.value})} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Theme Color</Label>
                  <div className="flex gap-2">
                    {['#4f46e5', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#f59e0b', '#f43f5e', '#d946ef', '#8b5cf6'].map(color => (
                      <div 
                        key={color}
                        className={`w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 ${formData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-background' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({...formData, color})}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createProject.isPending || !formData.name}>
                  Create Project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-48 animate-pulse bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => {
            const hoursPercent = project.budgetedHours > 0 ? (project.loggedHours / project.budgetedHours) * 100 : 0;
            const isOverBudget = hoursPercent > 90;
            
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full hover:-translate-y-1 transition-transform cursor-pointer overflow-hidden border-l-[6px] hover-elevate" style={{ borderLeftColor: project.color || 'var(--primary)' }}>
                  <div className="p-6 flex flex-col gap-4 h-full">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg line-clamp-1">{project.name}</h3>
                        <p className="text-sm text-muted-foreground">{project.clientName || 'Internal'}</p>
                      </div>
                      <Badge variant="outline" className={`border-transparent ${getStatusColor(project.status)}`}>
                        {project.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex-1" />

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-medium">Hours Logged</span>
                        <span className={`font-semibold ${isOverBudget ? 'text-destructive' : ''}`}>
                          {project.loggedHours} / {project.budgetedHours}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(hoursPercent, 100)} 
                        className="h-2"
                        indicatorClassName={isOverBudget ? 'bg-destructive' : 'bg-primary'} 
                      />
                    </div>
                    
                    <div className="flex justify-between items-center pt-2 border-t border-border mt-2 text-sm text-muted-foreground">
                      <span>{project.type.toUpperCase()}</span>
                      {project.budgetAmount ? (
                        <span className="font-medium text-foreground">
                          ${project.budgetAmount.toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
