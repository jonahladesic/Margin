import { useState, useRef, useCallback, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, X, Trash2 } from "lucide-react";
import { useListTimeBlocks, useCreateTimeBlock, useDeleteTimeBlock } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";

const PHASES = ["Discovery", "Vision", "Brand Identity", "Brand Standards"];
const SUB_PHASES = ["Project", "Design", "Meetings", "Internal Meetings"];
const HOUR_START = 8;
const HOUR_END = 20;
const CELL_HEIGHT = 64;

const PROJECT_COLORS = [
  "#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"
];

interface DragState {
  day: Date;
  startHour: number;
  endHour: number;
}

interface ModalState {
  open: boolean;
  day: Date | null;
  startHour: number;
  hours: number;
}

export default function Calendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false, day: null, startHour: 9, hours: 1 });
  const [form, setForm] = useState({ projectId: "", phaseId: "", subPhase: "", description: "" });
  const isDragging = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => HOUR_START + i);

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects");
      return r.json();
    },
  });

  const { data: timeblocks = [] } = useListTimeBlocks({
    request: {
      query: {
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
      },
    },
  });

  const [phases, setPhases] = useState<Record<string, { id: string; name: string }[]>>({});

  useEffect(() => {
    if (!form.projectId) return;
    fetch(`/api/projects/${form.projectId}/phases`)
      .then((r) => r.json())
      .then((data) => setPhases((prev) => ({ ...prev, [form.projectId]: data })));
  }, [form.projectId]);

  const createTimeBlock = useCreateTimeBlock();
  const deleteTimeBlock = useDeleteTimeBlock();

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const goToday = () => setCurrentDate(new Date());

  const totalLoggedThisWeek = (timeblocks as any[]).reduce((acc: number, tb: any) => acc + (tb.hours || 0), 0);

  const getHourFromY = useCallback((y: number, colEl: Element) => {
    const rect = colEl.getBoundingClientRect();
    const relY = y - rect.top;
    const hour = Math.floor(relY / CELL_HEIGHT) + HOUR_START;
    return Math.max(HOUR_START, Math.min(HOUR_END - 1, hour));
  }, []);

  const handleMouseDown = (e: React.MouseEvent, day: Date) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const col = e.currentTarget as Element;
    const hour = getHourFromY(e.clientY, col);
    isDragging.current = true;
    setDrag({ day, startHour: hour, endHour: hour });
  };

  const handleMouseMove = (e: React.MouseEvent, day: Date) => {
    if (!isDragging.current || !drag || !isSameDay(drag.day, day)) return;
    const col = e.currentTarget as Element;
    const hour = getHourFromY(e.clientY, col);
    setDrag((d) => d ? { ...d, endHour: hour } : null);
  };

  const handleMouseUp = (e: React.MouseEvent, day: Date) => {
    if (!isDragging.current || !drag || !isSameDay(drag.day, day)) return;
    isDragging.current = false;
    const startHour = Math.min(drag.startHour, drag.endHour);
    const endHour = Math.max(drag.startHour, drag.endHour) + 1;
    const hours = Math.max(0.5, endHour - startHour);
    setDrag(null);
    setModal({ open: true, day, startHour, hours });
    setForm({ projectId: "", phaseId: "", subPhase: "", description: "" });
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDrag(null);
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const handleSave = () => {
    if (!form.projectId || !modal.day) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    const selectedPhase = phases[form.projectId]?.find((p) => p.id === form.phaseId);
    createTimeBlock.mutate(
      {
        data: {
          projectId: form.projectId,
          phaseId: form.phaseId || undefined,
          date: format(modal.day, "yyyy-MM-dd"),
          hours: modal.hours,
          subPhase: form.subPhase || undefined,
          description: form.description || undefined,
          type: "work",
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Time block saved" });
          setModal({ open: false, day: null, startHour: 9, hours: 1 });
          queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
        },
        onError: () => toast({ title: "Failed to save", variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteTimeBlock.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Time block deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
      },
    });
  };

  const getProjectColor = (projectId: string) => {
    const proj = (projects as any[]).find((p) => p.id === projectId);
    return proj?.color || "#4f46e5";
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <div className="flex items-center gap-1 bg-card rounded-lg border p-1">
            <Button variant="ghost" size="icon" onClick={prevWeek} className="h-7 w-7">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-3 min-w-[160px] text-center">
              {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={nextWeek} className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToday}>This Week</Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Week total: <span className="font-semibold text-foreground">{totalLoggedThisWeek}h</span>
            <span className="text-muted-foreground"> / 40h</span>
          </div>
          <div className="w-32">
            <Progress value={Math.min((totalLoggedThisWeek / 40) * 100, 100)} className="h-2" />
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground px-6 pb-2 shrink-0">
        Click and drag on any day to create a time block
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="flex h-full min-h-[640px] bg-card border rounded-xl overflow-hidden">
          <div className="w-14 shrink-0 border-r bg-muted/20">
            <div className="h-12 border-b" />
            {hours.map((h) => (
              <div key={h} className="h-16 border-b flex items-start justify-end pr-2 pt-1">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                </span>
              </div>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-7" ref={gridRef}>
            {days.map((day, dIdx) => {
              const isToday = isSameDay(day, new Date());
              const dayBlocks = (timeblocks as any[]).filter((tb) =>
                isSameDay(new Date(tb.date), day)
              );
              const isDragDay = drag && isSameDay(drag.day, day);
              const dragTop = isDragDay
                ? (Math.min(drag.startHour, drag.endHour) - HOUR_START) * CELL_HEIGHT
                : 0;
              const dragHeight = isDragDay
                ? (Math.abs(drag.endHour - drag.startHour) + 1) * CELL_HEIGHT
                : 0;

              return (
                <div key={dIdx} className="border-r last:border-0 flex flex-col">
                  <div className={`h-12 border-b flex flex-col items-center justify-center shrink-0 ${isToday ? "bg-primary/5" : ""}`}>
                    <span className="text-xs text-muted-foreground">{format(day, "EEE")}</span>
                    <span className={`text-base font-semibold leading-none mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                      {format(day, "d")}
                    </span>
                  </div>

                  <div
                    className="relative flex-1 cursor-crosshair select-none"
                    onMouseDown={(e) => handleMouseDown(e, day)}
                    onMouseMove={(e) => handleMouseMove(e, day)}
                    onMouseUp={(e) => handleMouseUp(e, day)}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="h-16 border-b border-border/30 hover:bg-primary/[0.03] transition-colors"
                      />
                    ))}

                    {isDragDay && dragHeight > 0 && (
                      <div
                        className="absolute left-1 right-1 bg-primary/20 border border-primary/50 rounded pointer-events-none z-10"
                        style={{ top: dragTop, height: dragHeight }}
                      />
                    )}

                    {dayBlocks.map((tb: any, idx: number) => {
                      const color = getProjectColor(tb.projectId);
                      return (
                        <div
                          key={tb.id}
                          className="absolute left-1 right-1 rounded-md p-1.5 text-xs shadow-sm group cursor-pointer z-20"
                          style={{
                            top: 8 + idx * 72,
                            minHeight: Math.max(tb.hours * CELL_HEIGHT, 36),
                            backgroundColor: `${color}22`,
                            borderLeft: `3px solid ${color}`,
                          }}
                        >
                          <div className="font-semibold truncate" style={{ color }}>
                            {tb.projectName}
                          </div>
                          {tb.phaseName && (
                            <div className="text-muted-foreground text-[10px] truncate">{tb.phaseName}</div>
                          )}
                          {tb.subPhase && (
                            <div className="text-muted-foreground text-[10px] truncate">{tb.subPhase}</div>
                          )}
                          <div className="text-muted-foreground">{tb.hours}h</div>
                          <button
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            onClick={(e) => { e.stopPropagation(); handleDelete(tb.id); }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Log Time Block</h2>
                {modal.day && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {format(modal.day, "EEEE, MMMM d")} · {modal.startHour}:00 – {modal.startHour + modal.hours}:00
                  </p>
                )}
              </div>
              <button onClick={() => setModal({ open: false, day: null, startHour: 9, hours: 1 })} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Project <span className="text-destructive">*</span></Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v, phaseId: "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#4f46e5" }} />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Phase</Label>
                  <Select
                    value={form.phaseId}
                    onValueChange={(v) => setForm({ ...form, phaseId: v })}
                    disabled={!form.projectId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Phase…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(phases[form.projectId] || []).map((ph) => (
                        <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Sub-phase</Label>
                  <Select value={form.subPhase} onValueChange={(v) => setForm({ ...form, subPhase: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sub-phase…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUB_PHASES.map((sp) => (
                        <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  min={0.25}
                  max={24}
                  step={0.25}
                  value={modal.hours}
                  onChange={(e) => setModal({ ...modal, hours: parseFloat(e.target.value) || 1 })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="What did you work on?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setModal({ open: false, day: null, startHour: 9, hours: 1 })}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={createTimeBlock.isPending}>
                {createTimeBlock.isPending ? "Saving…" : "Save Block"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
