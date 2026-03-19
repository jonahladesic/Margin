import { useState, useRef, useCallback, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, Coffee, Building2, Plus } from "lucide-react";
import { useListTimeBlocks, useCreateTimeBlock, useDeleteTimeBlock } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

const SUB_PHASES = ["Project", "Design", "Meetings", "Internal Meetings"];

const HOUR_START = 0;
const HOUR_END = 24;
const CELL_HEIGHT = 16;
const SLOTS_PER_HOUR = 4;
const SLOT_HEIGHT = CELL_HEIGHT;
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR;

function slotToHours(slot: number): number {
  return slot / SLOTS_PER_HOUR;
}

function hoursToSlot(hours: number): number {
  return Math.round(hours * SLOTS_PER_HOUR);
}

function formatSlotTime(slot: number): string {
  const totalMin = slot * 15;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const period = h >= 12 ? "pm" : "am";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${displayH}${period}` : `${displayH}:${String(m).padStart(2, "0")}${period}`;
}

interface DragState {
  day: Date;
  startSlot: number;
  endSlot: number;
}

interface BlockDragState {
  blockId: string;
  blockData: any;
  startSlot: number;
  clickOffset: number;
  originalDay: Date;
  currentDay: Date;
  currentSlot: number;
  isAlt: boolean;
}

interface ResizeDragState {
  blockId: string;
  blockData: any;
  edge: "top" | "bottom";
  originalStartSlot: number;
  originalEndSlot: number;
  currentSlot: number;
  day: Date;
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
  const [blockDrag, setBlockDrag] = useState<BlockDragState | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false, day: null, startHour: 9, hours: 1 });
  const [form, setForm] = useState({ projectId: "", phaseId: "", subPhase: "", description: "" });
  const [panelOpen, setPanelOpen] = useState(true);
  const [allocPanelOpen, setAllocPanelOpen] = useState(true);
  const [allocFormOpen, setAllocFormOpen] = useState(false);
  const [allocForm, setAllocForm] = useState({ projectId: "", phaseId: "", hours: "8", startDate: "", endDate: "" });
  const [allocFormPhases, setAllocFormPhases] = useState<{ id: string; name: string }[]>([]);
  const [breakModal, setBreakModal] = useState<{ open: boolean; day: Date | null; startHour: number; hours: number; anchorX: number; anchorY: number }>({
    open: false, day: null, startHour: 12, hours: 0.5, anchorX: 0, anchorY: 0,
  });
  const [breakForm, setBreakForm] = useState({ label: "Lunch", hours: "0.5" });
  const [resizeDrag, setResizeDragState] = useState<ResizeDragState | null>(null);
  const resizeDragRef = useRef<ResizeDragState | null>(null);
  const setResizeDrag = (val: ResizeDragState | null) => {
    resizeDragRef.current = val;
    setResizeDragState(val);
  };

  const isDragging = useRef(false);
  const isBlockDragging = useRef(false);
  const isResizeDragging = useRef(false);
  const isBreakDragging = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => HOUR_START + i);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const r = await fetch("/api/projects");
      return r.json();
    },
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/current-user"],
    queryFn: async () => {
      const authRes = await fetch("/api/auth/user");
      const authData = await authRes.json();
      if (authData?.user?.id) return authData.user;
      const usersRes = await fetch("/api/users");
      const users = await usersRes.json();
      return users[0] ?? null;
    },
  });

  const { data: allocations = [], refetch: refetchAllocations } = useQuery({
    queryKey: ["/api/allocations", weekStartStr, weekEndStr],
    queryFn: async () => {
      const r = await fetch(`/api/allocations?weekStart=${weekStartStr}&weekEnd=${weekEndStr}`);
      return r.json();
    },
  });

  const createAllocation = useMutation({
    mutationFn: async (data: { userId?: string; projectId: string; phaseId?: string; allocatedHours: number; startDate: string; endDate: string }) => {
      const r = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create allocation");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Allocation added" });
      setAllocFormOpen(false);
      setAllocForm({ projectId: "", phaseId: "", hours: "8", startDate: weekStartStr, endDate: weekEndStr });
      refetchAllocations();
    },
    onError: () => toast({ title: "Failed to add allocation", variant: "destructive" }),
  });

  const rsmInternal = (projects as any[]).find((p: any) => p.isInternal === true);
  const activeProjects = (projects as any[]).filter(
    (p: any) => !p.isInternal && (p.status === "active" || !p.status)
  );

  const { data: timeblocks = [] } = useListTimeBlocks({
    request: {
      query: {
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
      },
    },
  });

  const { data: breakBlocks = [], refetch: refetchBreaks } = useQuery({
    queryKey: ["/api/break-blocks", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      const r = await fetch(`/api/break-blocks?startDate=${format(weekStart, "yyyy-MM-dd")}&endDate=${format(weekEnd, "yyyy-MM-dd")}`);
      return r.json();
    },
  });

  const createBreakBlock = useMutation({
    mutationFn: async (data: { date: string; startTime: number; hours: number; label: string }) => {
      const r = await fetch("/api/break-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Break block added" });
      refetchBreaks();
    },
  });

  const deleteBreakBlock = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/break-blocks/${id}`, { method: "DELETE" });
    },
    onSuccess: () => refetchBreaks(),
  });

  const [phases, setPhases] = useState<Record<string, { id: string; name: string }[]>>({});

  useEffect(() => {
    if (!form.projectId) return;
    fetch(`/api/projects/${form.projectId}/phases`)
      .then((r) => r.json())
      .then((data) => setPhases((prev) => ({ ...prev, [form.projectId]: data })));
  }, [form.projectId]);

  useEffect(() => {
    if (!allocForm.projectId) {
      setAllocFormPhases([]);
      return;
    }
    fetch(`/api/projects/${allocForm.projectId}/phases`)
      .then((r) => r.json())
      .then((data) => setAllocFormPhases(data));
  }, [allocForm.projectId]);

  useEffect(() => {
    if (allocFormOpen) {
      setAllocForm((f) => ({ ...f, startDate: weekStartStr, endDate: weekEndStr }));
    }
  }, [allocFormOpen, weekStartStr, weekEndStr]);

  const updateTimeBlock = useMutation({
    mutationFn: async ({ id, date, startTime, hours }: { id: string; date: string; startTime: number; hours?: number }) => {
      const r = await fetch(`/api/timeblocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startTime, ...(hours !== undefined ? { hours } : {}) }),
      });
      if (!r.ok) throw new Error("Failed to update block");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
    },
    onError: () => toast({ title: "Failed to update block", variant: "destructive" }),
  });

  const createTimeBlock = useCreateTimeBlock();
  const deleteTimeBlock = useDeleteTimeBlock();

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const goToday = () => setCurrentDate(new Date());

  const totalLoggedThisWeek = (timeblocks as any[]).reduce((acc: number, tb: any) => acc + (tb.hours || 0), 0);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const currentSlot = now.getHours() * SLOTS_PER_HOUR;
      const scrollTop = currentSlot * SLOT_HEIGHT - scrollRef.current.clientHeight / 2;
      scrollRef.current.scrollTop = Math.max(0, scrollTop);
    }
  }, []);

  const getSlotFromY = useCallback((y: number, colEl: Element) => {
    const rect = colEl.getBoundingClientRect();
    const relY = y - rect.top + (scrollRef.current?.scrollTop ?? 0);
    const slot = Math.floor(relY / SLOT_HEIGHT);
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, slot));
  }, []);

  const getSlotFromClientY = useCallback((clientY: number, colEl: Element) => {
    const rect = colEl.getBoundingClientRect();
    const relY = clientY - rect.top;
    const slot = Math.floor(relY / SLOT_HEIGHT);
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, slot));
  }, []);

  const handleMouseDown = (e: React.MouseEvent, day: Date) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const col = e.currentTarget as Element;
    const slot = getSlotFromClientY(e.clientY, col);
    isDragging.current = true;
    setDrag({ day, startSlot: slot, endSlot: slot });
  };

  const handleMouseMove = (e: React.MouseEvent, day: Date) => {
    if (!isDragging.current || !drag || !isSameDay(drag.day, day)) return;
    const col = e.currentTarget as Element;
    const slot = getSlotFromClientY(e.clientY, col);
    setDrag((d) => d ? { ...d, endSlot: slot } : null);
  };

  const handleMouseUp = (e: React.MouseEvent, day: Date) => {
    if (!isDragging.current || !drag || !isSameDay(drag.day, day)) return;
    isDragging.current = false;
    const startSlot = Math.min(drag.startSlot, drag.endSlot);
    const endSlot = Math.max(drag.startSlot, drag.endSlot) + 1;
    const hours = Math.max(0.25, slotToHours(endSlot - startSlot));
    const startHour = slotToHours(startSlot);
    setDrag(null);
    setModal({ open: true, day, startHour, hours });
    setForm({ projectId: "", phaseId: "", subPhase: "", description: "" });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, tb: any, edge: "top" | "bottom") => {
    e.preventDefault();
    e.stopPropagation();
    const originalStartSlot = tb.startTime != null ? hoursToSlot(tb.startTime) : 0;
    const originalEndSlot = originalStartSlot + hoursToSlot(tb.hours || 1);
    isResizeDragging.current = true;
    setResizeDrag({
      blockId: tb.id,
      blockData: tb,
      edge,
      originalStartSlot,
      originalEndSlot,
      currentSlot: edge === "top" ? originalStartSlot : originalEndSlot,
      day: parseLocalDate(tb.date),
    });
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setDrag(null);
      }
      if (isBlockDragging.current) {
        isBlockDragging.current = false;
        setBlockDrag(null);
      }
      if (isResizeDragging.current) {
        isResizeDragging.current = false;
        const rd = resizeDragRef.current;
        if (rd) {
          const tb = rd.blockData;
          let newStartSlot: number;
          let newEndSlot: number;
          if (rd.edge === "bottom") {
            newStartSlot = rd.originalStartSlot;
            newEndSlot = Math.max(rd.originalStartSlot + 1, rd.currentSlot);
          } else {
            newStartSlot = Math.min(rd.originalEndSlot - 1, rd.currentSlot);
            newEndSlot = rd.originalEndSlot;
          }
          const newStartTime = slotToHours(newStartSlot);
          const newHours = Math.max(0.25, slotToHours(newEndSlot - newStartSlot));
          if (newStartSlot !== rd.originalStartSlot || newEndSlot !== rd.originalEndSlot) {
            updateTimeBlock.mutate({ id: tb.id, date: tb.date, startTime: newStartTime, hours: newHours });
          }
        }
        setResizeDrag(null);
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const handleBlockMouseDown = (e: React.MouseEvent, tb: any) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const isAlt = e.altKey;

    const col = (e.currentTarget as HTMLElement).closest("[data-day-col]") as Element;
    const slot = col
      ? getSlotFromClientY(e.clientY, col)
      : (tb.startTime != null ? hoursToSlot(tb.startTime) : hoursToSlot(9));

    const blockTopSlot = tb.startTime != null ? hoursToSlot(tb.startTime) : slot;
    const clickOffset = Math.max(0, slot - blockTopSlot);

    isBlockDragging.current = true;
    setBlockDrag({
      blockId: tb.id,
      blockData: tb,
      startSlot: slot,
      clickOffset,
      originalDay: parseLocalDate(tb.date),
      currentDay: parseLocalDate(tb.date),
      currentSlot: slot,
      isAlt,
    });
  };

  const handleDayMouseMove = (e: React.MouseEvent, day: Date) => {
    if (isResizeDragging.current) {
      const col = e.currentTarget as Element;
      const slot = getSlotFromClientY(e.clientY, col);
      setResizeDrag(resizeDragRef.current ? { ...resizeDragRef.current, currentSlot: slot } : null);
      return;
    }
    if (isDragging.current && drag && isSameDay(drag.day, day)) {
      const col = e.currentTarget as Element;
      const slot = getSlotFromClientY(e.clientY, col);
      setDrag((d) => d ? { ...d, endSlot: slot } : null);
      return;
    }
    if (isBlockDragging.current && blockDrag) {
      const col = e.currentTarget as Element;
      const slot = getSlotFromClientY(e.clientY, col);
      setBlockDrag((bd) => bd ? { ...bd, currentDay: day, currentSlot: slot } : null);
    }
  };

  const handleDayMouseUp = (e: React.MouseEvent, day: Date) => {
    if (isDragging.current && drag && isSameDay(drag.day, day)) {
      handleMouseUp(e, day);
      return;
    }
    if (isBlockDragging.current && blockDrag) {
      isBlockDragging.current = false;
      const tb = blockDrag.blockData;
      const newTopSlot = Math.max(0, blockDrag.currentSlot - blockDrag.clickOffset);
      const dropDay = day;
      const newStartHour = slotToHours(newTopSlot);
      const hours = tb.hours || 1;

      if (blockDrag.isAlt) {
        createTimeBlock.mutate(
          {
            data: {
              projectId: tb.projectId,
              phaseId: tb.phaseId || undefined,
              date: format(dropDay, "yyyy-MM-dd"),
              hours,
              startTime: newStartHour,
              subPhase: tb.subPhase || undefined,
              description: tb.description || undefined,
              type: tb.type || "work",
            } as any,
          },
          {
            onSuccess: () => {
              toast({ title: "Block cloned" });
              queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
            },
            onError: () => toast({ title: "Failed to clone block", variant: "destructive" }),
          }
        );
      } else {
        const newDate = format(dropDay, "yyyy-MM-dd");
        const originalDate = tb.date;
        const originalStartSlot = tb.startTime != null ? hoursToSlot(tb.startTime) : null;
        const hasMoved = newDate !== originalDate || originalStartSlot !== newTopSlot;
        if (hasMoved) {
          updateTimeBlock.mutate({ id: tb.id, date: newDate, startTime: newStartHour });
        }
      }
      setBlockDrag(null);
    }
  };

  const handleBreakSave = () => {
    if (!breakModal.day) return;
    const h = parseFloat(breakForm.hours) || 0.5;
    createBreakBlock.mutate({
      date: format(breakModal.day, "yyyy-MM-dd"),
      startTime: breakModal.startHour,
      hours: h,
      label: breakForm.label || "Break",
    });
    setBreakModal({ open: false, day: null, startHour: 12, hours: 0.5, anchorX: 0, anchorY: 0 });
    setBreakForm({ label: "Lunch", hours: "0.5" });
  };

  const handleProjectDragStart = (e: React.DragEvent, project: any) => {
    e.dataTransfer.setData("projectId", project.id);
    e.dataTransfer.setData("projectName", project.name);
    e.dataTransfer.setData("dragType", "project");
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleBreakDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("dragType", "break");
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDayDragOver = (e: React.DragEvent, _day: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDayDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const dragType = e.dataTransfer.getData("dragType");
    const col = e.currentTarget as Element;
    const slot = getSlotFromClientY(e.clientY, col);
    const startHour = slotToHours(slot);

    if (dragType === "break") {
      setBreakModal({ open: true, day, startHour, hours: 0.5, anchorX: e.clientX, anchorY: e.clientY });
      setBreakForm({ label: "Lunch", hours: "0.5" });
      return;
    }

    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;

    setModal({ open: true, day, startHour, hours: 1 });
    setForm((f) => ({ ...f, projectId, phaseId: "", subPhase: "", description: "" }));

    if (!phases[projectId]) {
      fetch(`/api/projects/${projectId}/phases`)
        .then((r) => r.json())
        .then((data) => setPhases((prev) => ({ ...prev, [projectId]: data })));
    }
  };

  const handleSave = () => {
    if (!form.projectId || !modal.day) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    createTimeBlock.mutate(
      {
        data: {
          projectId: form.projectId,
          phaseId: form.phaseId || undefined,
          date: format(modal.day, "yyyy-MM-dd"),
          hours: modal.hours,
          startTime: modal.startHour,
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
          queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
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

  const handleAllocSave = () => {
    if (!allocForm.projectId || !allocForm.hours || !allocForm.startDate || !allocForm.endDate) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createAllocation.mutate({
      userId: currentUser?.id,
      projectId: allocForm.projectId,
      phaseId: allocForm.phaseId || undefined,
      allocatedHours: parseFloat(allocForm.hours),
      startDate: allocForm.startDate,
      endDate: allocForm.endDate,
    });
  };

  const getProjectColor = (projectId: string) => {
    const proj = (projects as any[]).find((p: any) => p.id === projectId);
    return proj?.color || "#4f46e5";
  };

  const closeModal = () => setModal({ open: false, day: null, startHour: 9, hours: 1 });

  const formatTimeRange = (startHour: number, hours: number) => {
    const startSlot = hoursToSlot(startHour);
    const endSlot = hoursToSlot(startHour + hours);
    return `${formatSlotTime(startSlot)} – ${formatSlotTime(endSlot)}`;
  };

  const allocList = (allocations as any[]);
  const totalAllocated = allocList.reduce((s: number, a: any) => s + (a.allocatedHours || 0), 0);
  const totalLogged = allocList.reduce((s: number, a: any) => s + (a.loggedHours || 0), 0);
  const totalRemaining = totalAllocated - totalLogged;

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
        Drag to create · Alt+drag a block to clone · Drag a project from the panel to schedule it
      </div>

      <div className="flex-1 flex overflow-hidden px-6 pb-6 gap-3">
        {/* Left: Projects panel */}
        <div className={`flex flex-col shrink-0 transition-all duration-200 ${panelOpen ? "w-44" : "w-8"}`}>
          <div className="bg-card border rounded-xl overflow-hidden flex flex-col h-full">
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="flex items-center justify-between px-3 py-2.5 border-b hover:bg-muted/50 transition-colors text-sm font-semibold shrink-0 w-full"
            >
              {panelOpen ? (
                <>
                  <span>Projects</span>
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                </>
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
              )}
            </button>
            {panelOpen && (
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
                {/* Break chip */}
                <div
                  draggable
                  onDragStart={handleBreakDragStart}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/60 transition-colors select-none border border-dashed border-border/60"
                  title="Drag to add a break/lunch block"
                >
                  <Coffee className="h-3 w-3 text-gray-400 shrink-0" />
                  <span className="text-xs font-medium text-gray-400">Break</span>
                </div>

                {/* RSM Internal pinned */}
                {rsmInternal && (
                  <div
                    draggable
                    onDragStart={(e) => handleProjectDragStart(e, rsmInternal)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/60 transition-colors select-none border border-green-800/40 bg-green-950/20"
                    title="Drag to log overhead time (PTO, WOW, etc.)"
                  >
                    <Building2 className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="text-xs font-medium text-green-400 truncate">RSM Internal</span>
                  </div>
                )}

                <div className="border-t border-border/30 my-0.5" />

                {activeProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4 px-2">No active projects</p>
                ) : (
                  activeProjects.map((proj: any) => (
                    <div
                      key={proj.id}
                      draggable
                      onDragStart={(e) => handleProjectDragStart(e, proj)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/60 transition-colors select-none"
                      title={`Drag to schedule ${proj.name}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: proj.color || "#4f46e5" }}
                      />
                      <span className="text-xs font-medium truncate">{proj.name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Calendar grid */}
        <div className="flex-1 overflow-hidden bg-card border rounded-xl flex flex-col">
          <div className="flex shrink-0">
            <div className="w-14 shrink-0 border-r bg-muted/20" />
            {days.map((day, dIdx) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={dIdx}
                  className={`flex-1 h-12 border-b border-r last:border-r-0 flex flex-col items-center justify-center ${isToday ? "bg-primary/5" : ""}`}
                >
                  <span className="text-xs text-muted-foreground">{format(day, "EEE")}</span>
                  <span className={`text-base font-semibold leading-none mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                    {format(day, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto" ref={scrollRef}>
            <div className="flex" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}>
              <div className="w-14 shrink-0 border-r bg-muted/20 relative">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-b border-border/20 flex items-start justify-end pr-2 pt-0.5"
                    style={{ top: h * SLOTS_PER_HOUR * SLOT_HEIGHT, height: SLOTS_PER_HOUR * SLOT_HEIGHT }}
                  >
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex-1 grid grid-cols-7" ref={gridRef}>
                {days.map((day, dIdx) => {
                  const isToday = isSameDay(day, new Date());
                  const dayBlocks = (timeblocks as any[]).filter((tb) =>
                    isSameDay(parseLocalDate(tb.date), day)
                  );
                  const dayBreaks = (breakBlocks as any[]).filter((bb) =>
                    isSameDay(parseLocalDate(bb.date), day)
                  );
                  const isDragDay = drag && isSameDay(drag.day, day);
                  const dragStartSlot = isDragDay ? Math.min(drag.startSlot, drag.endSlot) : 0;
                  const dragEndSlot = isDragDay ? Math.max(drag.startSlot, drag.endSlot) + 1 : 0;
                  const dragTop = dragStartSlot * SLOT_HEIGHT;
                  const dragHeight = (dragEndSlot - dragStartSlot) * SLOT_HEIGHT;

                  const isBlockDragDay = blockDrag && isSameDay(blockDrag.currentDay, day);

                  return (
                    <div
                      key={dIdx}
                      data-day-col
                      className={`border-r last:border-0 relative cursor-crosshair select-none ${isToday ? "bg-primary/[0.015]" : ""}`}
                      style={{ height: TOTAL_SLOTS * SLOT_HEIGHT }}
                      onMouseDown={(e) => {
                        if (!(e.target as HTMLElement).closest("[data-block]")) {
                          handleMouseDown(e, day);
                        }
                      }}
                      onMouseMove={(e) => handleDayMouseMove(e, day)}
                      onMouseUp={(e) => handleDayMouseUp(e, day)}
                      onDragOver={(e) => handleDayDragOver(e, day)}
                      onDrop={(e) => handleDayDrop(e, day)}
                    >
                      {hours.map((h) => (
                        <div key={h}>
                          <div
                            className="border-b border-border/30"
                            style={{ height: SLOT_HEIGHT, top: h * SLOTS_PER_HOUR * SLOT_HEIGHT }}
                          />
                          <div
                            className="border-b border-border/10"
                            style={{ height: SLOT_HEIGHT }}
                          />
                          <div
                            className="border-b border-border/10"
                            style={{ height: SLOT_HEIGHT }}
                          />
                          <div
                            className="border-b border-border/10"
                            style={{ height: SLOT_HEIGHT }}
                          />
                        </div>
                      ))}

                      {isDragDay && dragHeight > 0 && (
                        <div
                          className="absolute left-0.5 right-0.5 bg-primary/20 border border-primary/50 rounded pointer-events-none z-10"
                          style={{ top: dragTop, height: dragHeight }}
                        />
                      )}

                      {isBlockDragDay && blockDrag && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-30 border-2"
                          style={{
                            top: Math.max(0, blockDrag.currentSlot - blockDrag.clickOffset) * SLOT_HEIGHT,
                            height: Math.max(hoursToSlot(blockDrag.blockData.hours || 1) * SLOT_HEIGHT, 20),
                            backgroundColor: `${getProjectColor(blockDrag.blockData.projectId)}44`,
                            borderColor: getProjectColor(blockDrag.blockData.projectId),
                            opacity: 0.85,
                          }}
                        />
                      )}

                      {resizeDrag && isSameDay(resizeDrag.day, day) && (() => {
                        const rd = resizeDrag;
                        const resizeStartSlot = rd.edge === "bottom"
                          ? rd.originalStartSlot
                          : Math.min(rd.originalEndSlot - 1, rd.currentSlot);
                        const resizeEndSlot = rd.edge === "bottom"
                          ? Math.max(rd.originalStartSlot + 1, rd.currentSlot)
                          : rd.originalEndSlot;
                        const color = getProjectColor(rd.blockData.projectId);
                        return (
                          <div
                            className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-30 border-2"
                            style={{
                              top: resizeStartSlot * SLOT_HEIGHT,
                              height: Math.max((resizeEndSlot - resizeStartSlot) * SLOT_HEIGHT, SLOT_HEIGHT),
                              backgroundColor: `${color}44`,
                              borderColor: color,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })()}

                      {dayBlocks.map((tb: any, idx: number) => {
                        const isInternal = rsmInternal && tb.projectId === rsmInternal.id;
                        const color = isInternal ? "#16a34a" : getProjectColor(tb.projectId);
                        const blockHours = tb.hours || 1;
                        const blockHeightPx = Math.max(hoursToSlot(blockHours) * SLOT_HEIGHT, 20);
                        const hasStartTime = tb.startTime != null && !isNaN(tb.startTime);
                        const topOffset = hasStartTime
                          ? hoursToSlot(tb.startTime) * SLOT_HEIGHT
                          : idx * (blockHeightPx + 2) + 1;
                        const isBeingMoved = blockDrag && blockDrag.blockId === tb.id && !blockDrag.isAlt;
                        const isBeingResized = resizeDrag && resizeDrag.blockId === tb.id;

                        return (
                          <div
                            key={tb.id}
                            data-block
                            className="absolute left-0.5 right-0.5 rounded-md p-1.5 text-xs shadow-sm group cursor-grab active:cursor-grabbing z-20 overflow-hidden"
                            style={isInternal ? {
                              top: topOffset,
                              height: blockHeightPx,
                              backgroundColor: "#16a34a14",
                              border: "1px solid #16a34a55",
                              boxShadow: "inset 2px 0 0 #16a34a88",
                              opacity: isBeingMoved || isBeingResized ? 0.3 : 1,
                            } : {
                              top: topOffset,
                              height: blockHeightPx,
                              backgroundColor: `${color}22`,
                              borderLeft: `3px solid ${color}`,
                              opacity: isBeingMoved || isBeingResized ? 0.3 : 1,
                            }}
                            onMouseDown={(e) => handleBlockMouseDown(e, tb)}
                            title="Alt+drag to clone"
                          >
                            {/* Top resize handle */}
                            <div
                              className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100"
                              onMouseDown={(e) => handleResizeMouseDown(e, tb, "top")}
                            />
                            <div className="font-semibold truncate" style={{ color }}>
                              {isInternal && <Building2 className="inline h-2.5 w-2.5 mr-0.5 mb-0.5" />}
                              {tb.projectName}
                            </div>
                            {!isInternal && tb.phaseName && (
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
                            {/* Bottom resize handle */}
                            <div
                              className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100"
                              onMouseDown={(e) => handleResizeMouseDown(e, tb, "bottom")}
                            />
                          </div>
                        );
                      })}

                      {dayBreaks.map((bb: any) => {
                        const heightPx = Math.max(hoursToSlot(bb.hours || 0.5) * SLOT_HEIGHT, 16);
                        const topOffset = hoursToSlot(bb.startTime) * SLOT_HEIGHT;
                        return (
                          <div
                            key={bb.id}
                            data-block
                            className="absolute left-0.5 right-0.5 rounded-md p-1 text-xs z-20 overflow-hidden group"
                            style={{
                              top: topOffset,
                              height: heightPx,
                              background: "repeating-linear-gradient(45deg, #374151 0px, #374151 2px, transparent 2px, transparent 8px)",
                              backgroundColor: "#1f293730",
                              borderLeft: "3px solid #6b7280",
                            }}
                            title={bb.label}
                          >
                            <div className="flex items-center gap-0.5 text-gray-400 font-medium">
                              <Coffee className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{bb.label}</span>
                            </div>
                            <button
                              className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-destructive transition-opacity"
                              onClick={(e) => { e.stopPropagation(); deleteBreakBlock.mutate(bb.id); }}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Allocations panel */}
        <div className={`flex flex-col shrink-0 transition-all duration-200 ${allocPanelOpen ? "w-56" : "w-8"}`}>
          <div className="bg-card border rounded-xl overflow-hidden flex flex-col h-full">
            <button
              onClick={() => setAllocPanelOpen(!allocPanelOpen)}
              className="flex items-center justify-between px-3 py-2.5 border-b hover:bg-muted/50 transition-colors text-sm font-semibold shrink-0 w-full"
            >
              {allocPanelOpen ? (
                <>
                  <span className="truncate">This Week's Allocations</span>
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                </>
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
              )}
            </button>

            {allocPanelOpen && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {allocList.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 px-3">No allocations this week</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border/30">
                    {allocList.map((alloc: any) => {
                      const allocated = alloc.allocatedHours || 0;
                      const logged = alloc.loggedHours || 0;
                      const remaining = allocated - logged;
                      const pct = allocated > 0 ? Math.min((logged / allocated) * 100, 100) : 0;
                      const isOver = logged > allocated;
                      const isAmber = !isOver && pct >= 80;
                      const overBy = isOver ? (logged - allocated).toFixed(1) : null;

                      let barColor = "bg-primary";
                      if (isOver) barColor = "bg-red-500";
                      else if (isAmber) barColor = "bg-amber-500";

                      return (
                        <div key={alloc.id} className="px-3 py-2.5 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: alloc.projectColor || "#4f46e5" }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium truncate leading-tight">{alloc.projectName}</div>
                              {alloc.phaseName && (
                                <div className="text-[10px] text-muted-foreground truncate leading-tight">{alloc.phaseName}</div>
                              )}
                            </div>
                          </div>
                          <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`absolute inset-y-0 left-0 rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {logged}h / {allocated}h
                            </span>
                            {isOver ? (
                              <span className="text-[10px] font-semibold text-red-500 shrink-0">
                                +{overBy}h over
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {remaining.toFixed(1)}h left
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {allocList.length > 0 && (
                  <div className="border-t border-border/50 px-3 py-2 mt-auto">
                    <div className="text-[10px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>Allocated</span>
                        <span className="font-medium text-foreground tabular-nums">{totalAllocated}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Logged</span>
                        <span className="font-medium text-foreground tabular-nums">{totalLogged.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between border-t border-border/30 pt-0.5 mt-0.5">
                        <span>Remaining</span>
                        <span className={`font-semibold tabular-nums ${totalRemaining < 0 ? "text-red-500" : "text-foreground"}`}>
                          {totalRemaining.toFixed(1)}h
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-3 pb-3 pt-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => setAllocFormOpen(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Add Allocation
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log time modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Log Time Block</h2>
                {modal.day && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {format(modal.day, "EEEE, MMMM d")} · {formatTimeRange(modal.startHour, modal.hours)}
                  </p>
                )}
              </div>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
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
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={createTimeBlock.isPending}>
                {createTimeBlock.isPending ? "Saving…" : "Save Block"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add allocation modal */}
      {allocFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Add Allocation</h2>
              <button onClick={() => setAllocFormOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Project <span className="text-destructive">*</span></Label>
                <Select value={allocForm.projectId} onValueChange={(v) => setAllocForm({ ...allocForm, projectId: v, phaseId: "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p: any) => (
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

              <div className="grid gap-2">
                <Label>Phase</Label>
                <Select
                  value={allocForm.phaseId}
                  onValueChange={(v) => setAllocForm({ ...allocForm, phaseId: v })}
                  disabled={!allocForm.projectId || allocFormPhases.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={allocForm.projectId && allocFormPhases.length === 0 ? "No phases" : "Phase (optional)…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {allocFormPhases.map((ph) => (
                      <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Allocated Hours <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={0.25}
                  max={168}
                  step={0.25}
                  value={allocForm.hours}
                  onChange={(e) => setAllocForm({ ...allocForm, hours: e.target.value })}
                  placeholder="e.g. 8"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Start Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={allocForm.startDate}
                    onChange={(e) => setAllocForm({ ...allocForm, startDate: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>End Date <span className="text-destructive">*</span></Label>
                  <Input
                    type="date"
                    value={allocForm.endDate}
                    onChange={(e) => setAllocForm({ ...allocForm, endDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setAllocFormOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAllocSave} disabled={createAllocation.isPending}>
                {createAllocation.isPending ? "Saving…" : "Add Allocation"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Break modal */}
      {breakModal.open && (() => {
        const popW = 240;
        const popH = 230;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rawX = breakModal.anchorX + 12;
        const rawY = breakModal.anchorY - 16;
        const popX = rawX + popW > vw ? breakModal.anchorX - popW - 8 : rawX;
        const popY = rawY + popH > vh ? vh - popH - 12 : Math.max(8, rawY);
        const closeBreak = () => setBreakModal({ open: false, day: null, startHour: 12, hours: 0.5, anchorX: 0, anchorY: 0 });
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={closeBreak} />
            <div
              className="fixed z-50 bg-card border rounded-xl shadow-2xl p-4 flex flex-col gap-3"
              style={{ left: popX, top: popY, width: popW }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Coffee className="h-4 w-4 text-gray-400" />
                  <span className="font-semibold text-sm">Add Break</span>
                </div>
                <button onClick={closeBreak} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {breakModal.day && (
                <p className="text-xs text-muted-foreground -mt-1">
                  {format(breakModal.day, "EEE, MMM d")} · {formatSlotTime(hoursToSlot(breakModal.startHour))}
                </p>
              )}
              <Select value={breakForm.label} onValueChange={(v) => setBreakForm({ ...breakForm, label: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Lunch">Lunch</SelectItem>
                  <SelectItem value="Break">Break</SelectItem>
                  <SelectItem value="Personal">Personal</SelectItem>
                  <SelectItem value="Dr. Appointment">Dr. Appointment</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Duration (h)</Label>
                <Input
                  type="number"
                  min={0.25}
                  max={8}
                  step={0.25}
                  value={breakForm.hours}
                  onChange={(e) => setBreakForm({ ...breakForm, hours: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={closeBreak}>Cancel</Button>
                <Button size="sm" onClick={handleBreakSave} disabled={createBreakBlock.isPending}>
                  {createBreakBlock.isPending ? "…" : "Add"}
                </Button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
