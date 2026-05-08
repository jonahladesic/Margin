import { useState, useRef, useCallback, useEffect } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, isSameDay, parse } from "date-fns";
import { ChevronLeft, ChevronRight, X, ChevronDown, ChevronUp, Coffee, Building2, Plus, Repeat, Eye, Pencil, Trash2, Copy, Calendar as CalendarIcon, Clock, GripVertical, Video, Users, Link } from "lucide-react";
import { useListTimeBlocks, useCreateTimeBlock, useDeleteTimeBlock } from "@workspace/api-client-react";
import { useCurrentUser } from "@/contexts/auth-context";
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
const CELL_HEIGHT = 12;
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

function decimalToTimeString(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeStringToDecimal(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h + (m || 0) / 60;
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
  isBreak?: boolean;
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

interface EditModalState {
  open: boolean;
  block: any | null;
  isBreak: boolean;
}

interface EditForm {
  projectId: string;
  phaseId: string;
  subPhase: string;
  description: string;
  date: string;
  startTime: string;
  hours: string;
}

interface EditBreakForm {
  label: string;
  date: string;
  startTime: string;
  hours: string;
  recurrenceRule: string;
}

export default function Calendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [blockDrag, setBlockDrag] = useState<BlockDragState | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false, day: null, startHour: 9, hours: 1 });
  const [form, setForm] = useState({ projectId: "", phaseId: "", subPhase: "", description: "" });
  const [modalMode, setModalMode] = useState<"project" | "break" | "meeting">("project");
  const [meetingForm, setMeetingForm] = useState({ title: "", attendeeIds: [] as string[], zoomLink: "", recurrenceRule: "", description: "" });
  const [panelOpen, setPanelOpen] = useState(true);
  const [allocPanelOpen, setAllocPanelOpen] = useState(true);
  const [topBarOpen, setTopBarOpen] = useState(true);
  const [allocFormOpen, setAllocFormOpen] = useState(false);
  const [allocForm, setAllocForm] = useState({ projectId: "", phaseId: "", hours: "8", startDate: "", endDate: "" });
  const [allocFormPhases, setAllocFormPhases] = useState<{ id: string; name: string }[]>([]);
  const [breakModal, setBreakModal] = useState<{ open: boolean; day: Date | null; startHour: number; hours: number; anchorX: number; anchorY: number }>({
    open: false, day: null, startHour: 12, hours: 0.5, anchorX: 0, anchorY: 0,
  });
  const [breakForm, setBreakForm] = useState({ label: "Lunch", hours: "0.5", recurrenceRule: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; breakId: string; seriesId: string | null; anchorX: number; anchorY: number }>({ open: false, breakId: "", seriesId: null, anchorX: 0, anchorY: 0 });
  const [editModal, setEditModal] = useState<EditModalState>({ open: false, block: null, isBreak: false });
  const [editForm, setEditForm] = useState<EditForm>({ projectId: "", phaseId: "", subPhase: "", description: "", date: "", startTime: "", hours: "" });
  const [editBreakForm, setEditBreakForm] = useState<EditBreakForm>({ label: "", date: "", startTime: "", hours: "", recurrenceRule: "" });
  const [editPhases, setEditPhases] = useState<{ id: string; name: string }[]>([]);
  const clickStartPos = useRef<{ x: number; y: number } | null>(null);
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

  const { user: currentUser, allUsers, isPM, isAdmin } = useCurrentUser();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // The effective user whose calendar we're viewing
  const effectiveUserId = viewingUserId || currentUser?.id || null;
  const isViewingOther = viewingUserId && viewingUserId !== currentUser?.id;
  const viewingUser = allUsers.find((u) => u.id === effectiveUserId);
  const designers = allUsers.filter((u) => u.role === "designer");

  const { data: allocations = [], refetch: refetchAllocations } = useQuery({
    queryKey: ["/api/allocations", weekStartStr, weekEndStr, effectiveUserId],
    queryFn: async () => {
      const params = new URLSearchParams({ weekStart: weekStartStr, weekEnd: weekEndStr });
      if (effectiveUserId) params.set("userId", effectiveUserId);
      const r = await fetch(`/api/allocations?${params}`);
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

  const internalProject = (projects as any[]).find((p: any) => p.isInternal === true);
  const activeProjects = (projects as any[]).filter(
    (p: any) => !p.isInternal && (p.status === "active" || !p.status)
  );

  const { data: timeblocks = [] } = useListTimeBlocks({
    startDate: format(weekStart, "yyyy-MM-dd"),
    endDate: format(weekEnd, "yyyy-MM-dd"),
    ...(effectiveUserId ? { userId: effectiveUserId } : {}),
  });

  const { data: breakBlocks = [], refetch: refetchBreaks } = useQuery({
    queryKey: ["/api/break-blocks", format(weekStart, "yyyy-MM-dd"), format(weekEnd, "yyyy-MM-dd"), effectiveUserId],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(weekEnd, "yyyy-MM-dd"),
      });
      if (effectiveUserId) params.set("userId", effectiveUserId);
      const r = await fetch(`/api/break-blocks?${params}`);
      return r.json();
    },
  });

  const { data: meetings = [], refetch: refetchMeetings } = useQuery({
    queryKey: ["/api/meetings", weekStartStr, weekEndStr, effectiveUserId],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: weekStartStr, endDate: weekEndStr });
      if (effectiveUserId) params.set("userId", effectiveUserId);
      const r = await fetch(`/api/meetings?${params}`);
      return r.json();
    },
  });

  const createMeeting = useMutation({
    mutationFn: async (data: { title: string; organizerId: string; date: string; startTime: number; hours: number; zoomLink?: string; attendeeIds?: string[]; recurrenceRule?: string; projectId?: string; description?: string }) => {
      const r = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create meeting");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Meeting scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
      refetchMeetings();
    },
    onError: () => toast({ title: "Failed to schedule meeting", variant: "destructive" }),
  });

  const createBreakBlock = useMutation({
    mutationFn: async (data: { date: string; startTime: number; hours: number; label: string; recurrenceRule?: string; userId?: string }) => {
      const r = await fetch("/api/break-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, userId: data.userId || effectiveUserId }),
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Break block added" });
      refetchBreaks();
    },
  });

  const deleteBreakBlock = useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope?: string }) => {
      const params = scope ? `?scope=${scope}` : "";
      await fetch(`/api/break-blocks/${id}${params}`, { method: "DELETE" });
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

  const updateBreakBlock = useMutation({
    mutationFn: async ({ id, date, startTime }: { id: string; date: string; startTime: number }) => {
      const r = await fetch(`/api/break-blocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startTime }),
      });
      if (!r.ok) throw new Error("Failed to move break block");
      return r.json();
    },
    onSuccess: () => refetchBreaks(),
    onError: () => toast({ title: "Failed to move break block", variant: "destructive" }),
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
    setModalMode("project");
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

  const handleBlockMouseDown = (e: React.MouseEvent, tb: any, isBreak = false) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const isAlt = e.altKey;

    clickStartPos.current = { x: e.clientX, y: e.clientY };

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
      isBreak,
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

      // Check if this was a click (not a drag) — open edit modal
      const startPos = clickStartPos.current;
      const dist = startPos ? Math.sqrt(Math.pow(e.clientX - startPos.x, 2) + Math.pow(e.clientY - startPos.y, 2)) : 999;
      clickStartPos.current = null;

      if (dist < 5 && !blockDrag.isAlt) {
        // Click — open edit modal
        if (blockDrag.isBreak) {
          openEditBreakBlock(tb);
        } else {
          openEditTimeBlock(tb);
        }
        setBlockDrag(null);
        return;
      }

      if (blockDrag.isAlt && !blockDrag.isBreak) {
        createTimeBlock.mutate(
          {
            data: {
              userId: effectiveUserId || undefined,
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
          if (blockDrag.isBreak) {
            updateBreakBlock.mutate({ id: tb.id, date: newDate, startTime: newStartHour });
          } else {
            updateTimeBlock.mutate({ id: tb.id, date: newDate, startTime: newStartHour });
          }
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
      ...(breakForm.recurrenceRule && breakForm.recurrenceRule !== "none" ? { recurrenceRule: breakForm.recurrenceRule } : {}),
    });
    setBreakModal({ open: false, day: null, startHour: 12, hours: 0.5, anchorX: 0, anchorY: 0 });
    setBreakForm({ label: "Lunch", hours: "0.5", recurrenceRule: "" });
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
      setBreakForm({ label: "Lunch", hours: "0.5", recurrenceRule: "" });
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
    if (!modal.day) return;

    if (modalMode === "break") {
      const h = parseFloat(breakForm.hours) || modal.hours;
      createBreakBlock.mutate({
        date: format(modal.day, "yyyy-MM-dd"),
        startTime: modal.startHour,
        hours: h,
        label: breakForm.label || "Break",
        ...(breakForm.recurrenceRule && breakForm.recurrenceRule !== "none" ? { recurrenceRule: breakForm.recurrenceRule } : {}),
      });
      setModal({ open: false, day: null, startHour: 9, hours: 1 });
      setBreakForm({ label: "Lunch", hours: "0.5", recurrenceRule: "" });
      return;
    }

    if (modalMode === "meeting") {
      if (!meetingForm.title) {
        toast({ title: "Please enter a meeting title", variant: "destructive" });
        return;
      }
      // Find internal project for meeting context
      const internalProject = internalProject;
      createMeeting.mutate({
        title: meetingForm.title,
        organizerId: effectiveUserId || currentUser?.id || "",
        date: format(modal.day, "yyyy-MM-dd"),
        startTime: modal.startHour,
        hours: modal.hours,
        zoomLink: meetingForm.zoomLink || undefined,
        attendeeIds: meetingForm.attendeeIds.length > 0 ? meetingForm.attendeeIds : undefined,
        recurrenceRule: meetingForm.recurrenceRule && meetingForm.recurrenceRule !== "none" ? meetingForm.recurrenceRule : undefined,
        projectId: internalProject?.id,
        description: meetingForm.description || undefined,
      });
      setModal({ open: false, day: null, startHour: 9, hours: 1 });
      setMeetingForm({ title: "", attendeeIds: [], zoomLink: "", recurrenceRule: "", description: "" });
      return;
    }

    if (!form.projectId) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    createTimeBlock.mutate(
      {
        data: {
          userId: effectiveUserId || undefined,
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
      userId: effectiveUserId || currentUser?.id,
      projectId: allocForm.projectId,
      phaseId: allocForm.phaseId || undefined,
      allocatedHours: parseFloat(allocForm.hours),
      startDate: allocForm.startDate,
      endDate: allocForm.endDate,
    });
  };

  // Fetch phases for edit modal when projectId changes
  useEffect(() => {
    if (!editForm.projectId) { setEditPhases([]); return; }
    fetch(`/api/projects/${editForm.projectId}/phases`)
      .then((r) => r.json())
      .then((data) => setEditPhases(data))
      .catch(() => setEditPhases([]));
  }, [editForm.projectId]);

  const openEditTimeBlock = (tb: any) => {
    setEditForm({
      projectId: tb.projectId || "",
      phaseId: tb.phaseId || "",
      subPhase: tb.subPhase || "",
      description: tb.description || "",
      date: tb.date || "",
      startTime: tb.startTime != null ? decimalToTimeString(tb.startTime) : "09:00",
      hours: String(tb.hours || 1),
    });
    setEditModal({ open: true, block: tb, isBreak: false });
  };

  const openEditBreakBlock = (bb: any) => {
    setEditBreakForm({
      label: bb.label || "Break",
      date: bb.date || "",
      startTime: decimalToTimeString(bb.startTime ?? 0),
      hours: String(bb.hours || 0.5),
      recurrenceRule: bb.recurrenceRule || "",
    });
    setEditModal({ open: true, block: bb, isBreak: true });
  };

  const handleEditSave = async () => {
    if (!editModal.block) return;
    const tb = editModal.block;
    try {
      const r = await fetch(`/api/timeblocks/${tb.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editForm.date,
          startTime: timeStringToDecimal(editForm.startTime),
          hours: parseFloat(editForm.hours) || 1,
          phaseId: editForm.phaseId || null,
          subPhase: editForm.subPhase || null,
          description: editForm.description || null,
        }),
      });
      if (!r.ok) throw new Error("Failed to update");
      queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/allocations"] });
      toast({ title: "Block updated" });
      setEditModal({ open: false, block: null, isBreak: false });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const handleEditBreakSave = () => {
    if (!editModal.block) return;
    const bb = editModal.block;
    updateBreakBlock.mutate(
      {
        id: bb.id,
        date: editBreakForm.date,
        startTime: timeStringToDecimal(editBreakForm.startTime),
      },
      {
        onSuccess: () => {
          toast({ title: "Break updated" });
          setEditModal({ open: false, block: null, isBreak: false });
        },
        onError: () => toast({ title: "Failed to update break", variant: "destructive" }),
      }
    );
  };

  const handleEditDelete = () => {
    if (!editModal.block) return;
    if (editModal.isBreak) {
      deleteBreakBlock.mutate({ id: editModal.block.id });
    } else {
      handleDelete(editModal.block.id);
    }
    setEditModal({ open: false, block: null, isBreak: false });
  };

  const handleEditClone = () => {
    if (!editModal.block || editModal.isBreak) return;
    const tb = editModal.block;
    createTimeBlock.mutate(
      {
        data: {
          userId: effectiveUserId || undefined,
          projectId: tb.projectId,
          phaseId: tb.phaseId || undefined,
          date: tb.date,
          hours: tb.hours,
          startTime: tb.startTime,
          subPhase: tb.subPhase || undefined,
          description: tb.description || undefined,
          type: tb.type || "work",
        } as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Block cloned" });
          queryClient.invalidateQueries({ queryKey: ["/api/timeblocks"] });
          setEditModal({ open: false, block: null, isBreak: false });
        },
      }
    );
  };

  const getProjectColor = (projectId: string) => {
    const proj = (projects as any[]).find((p: any) => p.id === projectId);
    return proj?.color || "#E8772E";
  };

  const closeModal = () => setModal({ open: false, day: null, startHour: 9, hours: 1 });

  const formatTimeRange = (startHour: number, hours: number) => {
    const startSlot = hoursToSlot(startHour);
    const endSlot = hoursToSlot(startHour + hours);
    return `${formatSlotTime(startSlot)} – ${formatSlotTime(endSlot)}`;
  };

  const allocList = (allocations as any[]);
  const billableAllocList = allocList.filter((a: any) => a.billingCategory !== "overhead");
  const overheadAllocList = allocList.filter((a: any) => a.billingCategory === "overhead");
  const totalAllocated = allocList.reduce((s: number, a: any) => s + (a.allocatedHours || 0), 0);
  const totalLogged = allocList.reduce((s: number, a: any) => s + (a.loggedHours || 0), 0);
  const totalRemaining = totalAllocated - totalLogged;

  // Calculate billable vs overhead hours from timeblocks
  const totalBillableHours = (timeblocks as any[])
    .filter((tb: any) => tb.billingCategory !== "overhead")
    .reduce((s: number, tb: any) => s + (tb.hours || 0), 0);
  const totalOverheadHours = (timeblocks as any[])
    .filter((tb: any) => tb.billingCategory === "overhead")
    .reduce((s: number, tb: any) => s + (tb.hours || 0), 0);
  const overtimeHours = Math.max(totalLoggedThisWeek - 40, 0);

  // Unallocated but logged: time blocks in this week that don't match any formal allocation
  const allocatedKeys = new Set(allocList.map((a: any) => `${a.projectId}::${a.phaseId || ""}`));
  const unallocMap = new Map<string, { projectId: string; projectName: string; projectColor: string; phaseName: string | null; loggedHours: number; billingCategory: string }>();
  for (const tb of (timeblocks as any[])) {
    const key = `${tb.projectId}::${tb.phaseId || ""}`;
    if (!allocatedKeys.has(key)) {
      if (!unallocMap.has(key)) {
        unallocMap.set(key, {
          projectId: tb.projectId,
          projectName: tb.projectName || "Unknown",
          projectColor: tb.projectColor || "#6b7280",
          phaseName: tb.phaseName || null,
          loggedHours: 0,
          billingCategory: tb.billingCategory || "billable",
        });
      }
      unallocMap.get(key)!.loggedHours += (tb.hours || 0);
    }
  }
  const unallocList = Array.from(unallocMap.values());
  const unallocBillable = unallocList.filter((u) => u.billingCategory !== "overhead");
  const unallocOverhead = unallocList.filter((u) => u.billingCategory === "overhead");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 gap-6">
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

          {/* PM/Admin: Designer selector */}
          {(isPM || isAdmin) && designers.length > 0 && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={viewingUserId || currentUser?.id || ""}
                onValueChange={(v) => setViewingUserId(v === currentUser?.id ? null : v)}
              >
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="View calendar…" />
                </SelectTrigger>
                <SelectContent>
                  {currentUser && (
                    <SelectItem value={currentUser.id}>
                      <span className="font-medium">My Calendar</span>
                    </SelectItem>
                  )}
                  {designers.filter((d) => d.id !== currentUser?.id).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {isViewingOther && viewingUser && (
            <div className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/30">
              <Eye className="h-3 w-3" />
              <span>Viewing <strong>{viewingUser.firstName} {viewingUser.lastName}</strong>'s calendar</span>
              <button onClick={() => setViewingUserId(null)} className="ml-1 hover:text-primary/70">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Week total: <span className="font-semibold text-foreground">{totalLoggedThisWeek}h</span>
              <span className="text-muted-foreground"> / 40h</span>
            </span>
            {totalBillableHours > 0 && (
              <span className="text-xs">Billable: <span className="font-medium text-foreground">{totalBillableHours.toFixed(1)}h</span></span>
            )}
            {totalOverheadHours > 0 && (
              <span className="text-xs">Overhead: <span className="font-medium text-foreground">{totalOverheadHours.toFixed(1)}h</span></span>
            )}
            {overtimeHours > 0 && (
              <span className="text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                +{overtimeHours.toFixed(1)}h overtime
              </span>
            )}
          </div>
          <div className="w-32">
            <Progress value={Math.min((totalLoggedThisWeek / 40) * 100, 100)} className={`h-2 ${overtimeHours > 0 ? "[&>div]:bg-red-500" : ""}`} />
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground px-6 pb-2 shrink-0">
        Drag to create · Alt+drag a block to clone · Drag a project from the panel to schedule it
      </div>

      {/* Top allocations bar */}
      <div className="px-6 pb-2 shrink-0">
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="flex items-center">
            <button
              onClick={() => setTopBarOpen(!topBarOpen)}
              className="flex-1 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-left"
            >
              <span className="text-foreground">This Week's Allocations</span>
              {allocList.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {totalAllocated}h allocated · {totalLogged.toFixed(1)}h logged
                </span>
              )}
              {unallocBillable.length > 0 && (
                <span className="font-normal text-amber-500">
                  · {unallocBillable.length} untracked
                </span>
              )}
              {(overheadAllocList.length > 0 || unallocOverhead.length > 0) && (
                <span className="font-normal text-slate-400">
                  · {totalOverheadHours.toFixed(1)}h overhead
                </span>
              )}
              {topBarOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 ml-auto" />}
            </button>
            <div className="px-3 py-1.5 border-l shrink-0">
              <button
                onClick={() => setAllocFormOpen(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 px-2 py-1 rounded transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Allocation
              </button>
            </div>
          </div>

          {topBarOpen && (
            <div className="border-t px-4 py-2.5 flex flex-wrap gap-2">
              {allocList.length === 0 && unallocList.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">No allocations or logged time this week</span>
              ) : (
                <>
                  {/* Billable allocations */}
                  {billableAllocList.map((alloc: any) => {
                    const pct = alloc.allocatedHours > 0 ? Math.min((alloc.loggedHours / alloc.allocatedHours) * 100, 100) : 0;
                    const isOver = alloc.loggedHours > alloc.allocatedHours;
                    return (
                      <div
                        key={alloc.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs"
                        style={{ borderColor: `${alloc.projectColor || "#E8772E"}40`, backgroundColor: `${alloc.projectColor || "#E8772E"}12` }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: alloc.projectColor || "#E8772E" }} />
                        <span className="font-medium" style={{ color: alloc.projectColor || "#E8772E" }}>
                          {alloc.projectName}{alloc.phaseName ? ` · ${alloc.phaseName}` : ""}
                        </span>
                        <span className={`text-[10px] tabular-nums ${isOver ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                          {alloc.loggedHours}h / {alloc.allocatedHours}h
                        </span>
                        <div className="w-12 h-1 rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isOver ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {/* Overhead allocations + unallocated overhead */}
                  {(overheadAllocList.length > 0 || unallocOverhead.length > 0) && billableAllocList.length > 0 && (
                    <div className="w-px h-6 bg-border/60 self-center mx-1" />
                  )}
                  {overheadAllocList.map((alloc: any) => {
                    const pct = alloc.allocatedHours > 0 ? Math.min((alloc.loggedHours / alloc.allocatedHours) * 100, 100) : 0;
                    return (
                      <div
                        key={alloc.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs border-slate-500/30 bg-slate-500/8"
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400" />
                        <span className="font-medium text-slate-400">
                          {alloc.projectName}{alloc.phaseName ? ` · ${alloc.phaseName}` : ""}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {alloc.loggedHours}h{alloc.allocatedHours > 0 ? ` / ${alloc.allocatedHours}h` : ""}
                        </span>
                        {alloc.allocatedHours > 0 && (
                          <div className="w-12 h-1 rounded-full bg-muted/60 overflow-hidden">
                            <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unallocOverhead.map((u) => (
                    <div
                      key={`oh-${u.projectId}::${u.phaseName || ""}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed text-xs border-slate-500/30"
                      title="Overhead — no allocation needed"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0 bg-slate-400 opacity-60" />
                      <span className="text-slate-400">
                        {u.projectName}{u.phaseName ? ` · ${u.phaseName}` : ""}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{u.loggedHours.toFixed(1)}h</span>
                    </div>
                  ))}

                  {/* Untracked billable */}
                  {unallocBillable.length > 0 && (billableAllocList.length > 0 || overheadAllocList.length > 0 || unallocOverhead.length > 0) && (
                    <div className="w-px h-6 bg-border/60 self-center mx-1" />
                  )}
                  {unallocBillable.map((u) => (
                    <div
                      key={`${u.projectId}::${u.phaseName || ""}`}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed text-xs border-border/60"
                      title="No formal allocation — logged without one"
                    >
                      <span className="w-2 h-2 rounded-full shrink-0 opacity-60" style={{ backgroundColor: u.projectColor }} />
                      <span className="text-muted-foreground">
                        {u.projectName}{u.phaseName ? ` · ${u.phaseName}` : ""}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{u.loggedHours.toFixed(1)}h</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
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

                {/* Internal project pinned */}
                {internalProject && (
                  <div
                    draggable
                    onDragStart={(e) => handleProjectDragStart(e, internalProject)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-muted/60 transition-colors select-none border border-primary/40 bg-primary/10"
                    title="Drag to log overhead time (PTO, WOW, etc.)"
                  >
                    <Building2 className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-xs font-medium text-primary truncate">Internal</span>
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
                        style={{ backgroundColor: proj.color || "#E8772E" }}
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
                {hours.map((h) => {
                  if (h === 0) return null; // Skip midnight label at very top
                  return (
                    <div
                      key={h}
                      className="absolute w-full flex items-start justify-end pr-2"
                      style={{ top: h * SLOTS_PER_HOUR * SLOT_HEIGHT }}
                    >
                      <span className="text-[10px] text-muted-foreground tabular-nums leading-none" style={{ transform: "translateY(-50%)" }}>
                        {h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
                      </span>
                    </div>
                  );
                })}
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
                            className="border-t border-border/30"
                            style={{ height: SLOT_HEIGHT }}
                          />
                          <div
                            className="border-t border-border/10"
                            style={{ height: SLOT_HEIGHT }}
                          />
                          <div
                            className="border-t border-border/10"
                            style={{ height: SLOT_HEIGHT }}
                          />
                          <div
                            className="border-t border-border/10"
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

                      {isBlockDragDay && blockDrag && (() => {
                        const ghostColor = blockDrag.isBreak ? "#6b7280" : getProjectColor(blockDrag.blockData.projectId);
                        return (
                          <div
                            className="absolute left-0.5 right-0.5 rounded-md pointer-events-none z-30 border-2"
                            style={{
                              top: Math.max(0, blockDrag.currentSlot - blockDrag.clickOffset) * SLOT_HEIGHT,
                              height: Math.max(hoursToSlot(blockDrag.blockData.hours || 1) * SLOT_HEIGHT, 20),
                              backgroundColor: `${ghostColor}44`,
                              borderColor: ghostColor,
                              opacity: 0.85,
                            }}
                          />
                        );
                      })()}

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
                        const isMeeting = tb.type === "meeting";
                        const isInternal = !isMeeting && internalProject && tb.projectId === internalProject.id;
                        const meetingColor = "#a855f7"; // purple
                        const color = isMeeting ? meetingColor : isInternal ? "#E8772E" : getProjectColor(tb.projectId);
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
                            style={isMeeting ? {
                              top: topOffset,
                              height: blockHeightPx,
                              backgroundColor: `${meetingColor}18`,
                              border: `1px solid ${meetingColor}55`,
                              boxShadow: `inset 2px 0 0 ${meetingColor}88`,
                              opacity: isBeingMoved || isBeingResized ? 0.3 : 1,
                            } : isInternal ? {
                              top: topOffset,
                              height: blockHeightPx,
                              backgroundColor: "#E8772E14",
                              border: "1px solid #E8772E55",
                              boxShadow: "inset 2px 0 0 #E8772E88",
                              opacity: isBeingMoved || isBeingResized ? 0.3 : 1,
                            } : {
                              top: topOffset,
                              height: blockHeightPx,
                              backgroundColor: `${color}22`,
                              borderLeft: `3px solid ${color}`,
                              opacity: isBeingMoved || isBeingResized ? 0.3 : 1,
                            }}
                            onMouseDown={(e) => handleBlockMouseDown(e, tb, false)}
                            title="Click to edit · Alt+drag to clone"
                          >
                            {/* Top resize handle */}
                            <div
                              className="absolute left-0 right-0 top-0 h-2 cursor-ns-resize z-10 opacity-0 group-hover:opacity-100"
                              onMouseDown={(e) => handleResizeMouseDown(e, tb, "top")}
                            />
                            <div className="font-semibold truncate" style={{ color }}>
                              {isMeeting && <Video className="inline h-2.5 w-2.5 mr-0.5 mb-0.5" />}
                              {isInternal && <Building2 className="inline h-2.5 w-2.5 mr-0.5 mb-0.5" />}
                              {isMeeting ? (tb.title || "Meeting") : tb.projectName}
                            </div>
                            {!isMeeting && !isInternal && tb.phaseName && (
                              <div className="text-muted-foreground text-[10px] truncate">{tb.phaseName}</div>
                            )}
                            {!isMeeting && tb.subPhase && (
                              <div className="text-muted-foreground text-[10px] truncate">{tb.subPhase}</div>
                            )}
                            {isMeeting && tb.description?.startsWith("Zoom:") && (
                              <div className="text-purple-400/70 text-[10px] truncate flex items-center gap-0.5">
                                <Link className="h-2 w-2" />
                                Zoom
                              </div>
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
                        const isBreakBeingMoved = blockDrag && blockDrag.blockId === bb.id && !blockDrag.isAlt;
                        return (
                          <div
                            key={bb.id}
                            data-block
                            className="absolute left-0.5 right-0.5 rounded-md p-1 text-xs z-20 overflow-hidden group cursor-grab active:cursor-grabbing"
                            style={{
                              top: topOffset,
                              height: heightPx,
                              background: "repeating-linear-gradient(45deg, #374151 0px, #374151 2px, transparent 2px, transparent 8px)",
                              backgroundColor: "#1f293730",
                              borderLeft: "3px solid #6b7280",
                              opacity: isBreakBeingMoved ? 0.3 : 1,
                            }}
                            title="Click to edit"
                            onMouseDown={(e) => handleBlockMouseDown(e, bb, true)}
                          >
                            <div className="flex items-center gap-0.5 text-gray-400 font-medium">
                              <Coffee className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{bb.label}</span>
                              {bb.seriesId && <Repeat className="h-2 w-2 shrink-0 opacity-60" />}
                            </div>
                            <button
                              className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-destructive transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (bb.seriesId) {
                                  setDeleteConfirm({ open: true, breakId: bb.id, seriesId: bb.seriesId, anchorX: e.clientX, anchorY: e.clientY });
                                } else {
                                  deleteBreakBlock.mutate({ id: bb.id });
                                }
                              }}
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

      </div>

      {/* Log time modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">{modalMode === "break" ? "Add Break" : modalMode === "meeting" ? "Schedule Meeting" : "Log Time Block"}</h2>
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
                <Label>{modalMode === "break" ? "Type" : "Project"} <span className="text-destructive">*</span></Label>
                <Select
                  value={modalMode === "break" ? "__break__" : modalMode === "meeting" ? "__meeting__" : form.projectId}
                  onValueChange={(v) => {
                    if (v === "__break__") {
                      setModalMode("break");
                      setBreakForm({ label: "Lunch", hours: String(modal.hours), recurrenceRule: "" });
                    } else if (v === "__meeting__") {
                      setModalMode("meeting");
                      setMeetingForm({ title: "", attendeeIds: [], zoomLink: "", recurrenceRule: "", description: "" });
                    } else {
                      setModalMode("project");
                      setForm({ ...form, projectId: v, phaseId: "" });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__break__">
                      <div className="flex items-center gap-2">
                        <Coffee className="h-3 w-3 text-gray-400" />
                        <span>Break / Lunch</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="__meeting__">
                      <div className="flex items-center gap-2">
                        <Video className="h-3 w-3 text-purple-400" />
                        <span>Meeting</span>
                      </div>
                    </SelectItem>
                    <div className="border-t border-border/30 my-1" />
                    {(projects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#E8772E" }} />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {modalMode === "break" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Label</Label>
                    <Select value={breakForm.label} onValueChange={(v) => setBreakForm({ ...breakForm, label: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Lunch">Lunch</SelectItem>
                        <SelectItem value="Break">Break</SelectItem>
                        <SelectItem value="Personal">Personal</SelectItem>
                        <SelectItem value="Dr. Appointment">Dr. Appointment</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Duration (hours)</Label>
                    <Input
                      type="number"
                      min={0.25}
                      max={8}
                      step={0.25}
                      value={breakForm.hours}
                      onChange={(e) => setBreakForm({ ...breakForm, hours: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="flex items-center gap-1"><Repeat className="h-3 w-3" /> Repeat</Label>
                    <Select value={breakForm.recurrenceRule || "none"} onValueChange={(v) => setBreakForm({ ...breakForm, recurrenceRule: v })}>
                      <SelectTrigger><SelectValue placeholder="No repeat" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No repeat</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekdays">Weekdays</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : modalMode === "meeting" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Title <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="Meeting title…"
                      value={meetingForm.title}
                      onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="flex items-center gap-1"><Users className="h-3 w-3" /> Attendees</Label>
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border rounded-md bg-background">
                      {meetingForm.attendeeIds.map((id) => {
                        const user = allUsers.find((u) => u.id === id);
                        return (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                            {user ? `${user.firstName} ${user.lastName}` : id}
                            <button onClick={() => setMeetingForm({ ...meetingForm, attendeeIds: meetingForm.attendeeIds.filter((a) => a !== id) })} className="hover:text-destructive">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        );
                      })}
                      <Select
                        value=""
                        onValueChange={(v) => {
                          if (v && !meetingForm.attendeeIds.includes(v)) {
                            setMeetingForm({ ...meetingForm, attendeeIds: [...meetingForm.attendeeIds, v] });
                          }
                        }}
                      >
                        <SelectTrigger className="h-6 w-auto border-0 bg-transparent shadow-none text-xs text-muted-foreground px-1">
                          <span>+ Add</span>
                        </SelectTrigger>
                        <SelectContent>
                          {allUsers
                            .filter((u) => u.id !== currentUser?.id && !meetingForm.attendeeIds.includes(u.id))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.firstName} {u.lastName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Hours</Label>
                      <Input
                        type="number"
                        min={0.25}
                        max={8}
                        step={0.25}
                        value={modal.hours}
                        onChange={(e) => setModal({ ...modal, hours: parseFloat(e.target.value) || 1 })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="flex items-center gap-1"><Link className="h-3 w-3" /> Zoom Link</Label>
                      <Input
                        placeholder="https://zoom.us/j/…"
                        value={meetingForm.zoomLink}
                        onChange={(e) => setMeetingForm({ ...meetingForm, zoomLink: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="flex items-center gap-1"><Repeat className="h-3 w-3" /> Repeat</Label>
                    <Select value={meetingForm.recurrenceRule || "none"} onValueChange={(v) => setMeetingForm({ ...meetingForm, recurrenceRule: v })}>
                      <SelectTrigger><SelectValue placeholder="No repeat" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No repeat</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekdays">Weekdays</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <Textarea
                      placeholder="Meeting agenda…"
                      value={meetingForm.description}
                      onChange={(e) => setMeetingForm({ ...meetingForm, description: e.target.value })}
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={modalMode === "break" ? createBreakBlock.isPending : modalMode === "meeting" ? createMeeting.isPending : createTimeBlock.isPending}>
                {modalMode === "break"
                  ? (createBreakBlock.isPending ? "Saving…" : "Add Break")
                  : modalMode === "meeting"
                  ? (createMeeting.isPending ? "Saving…" : "Schedule Meeting")
                  : (createTimeBlock.isPending ? "Saving…" : "Save Block")}
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
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#E8772E" }} />
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
              <Select value={breakForm.recurrenceRule} onValueChange={(v) => setBreakForm({ ...breakForm, recurrenceRule: v })}>
                <SelectTrigger className="h-8 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Repeat className="h-3 w-3 opacity-60" />
                    <SelectValue placeholder="No repeat" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No repeat</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
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

      {/* Delete recurring break confirmation */}
      {deleteConfirm.open && (() => {
        const popW = 200;
        const popH = 120;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const popX = deleteConfirm.anchorX + popW > vw ? deleteConfirm.anchorX - popW : deleteConfirm.anchorX;
        const popY = deleteConfirm.anchorY + popH > vh ? vh - popH - 12 : deleteConfirm.anchorY;
        const close = () => setDeleteConfirm({ open: false, breakId: "", seriesId: null, anchorX: 0, anchorY: 0 });
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div className="fixed z-50 bg-card border rounded-xl shadow-2xl p-3 flex flex-col gap-2" style={{ left: popX, top: popY, width: popW }}>
              <span className="text-xs font-semibold">Delete recurring break</span>
              <button className="text-xs text-left px-2 py-1.5 rounded hover:bg-muted" onClick={() => { deleteBreakBlock.mutate({ id: deleteConfirm.breakId }); close(); }}>
                This one only
              </button>
              <button className="text-xs text-left px-2 py-1.5 rounded hover:bg-muted" onClick={() => { deleteBreakBlock.mutate({ id: deleteConfirm.breakId, scope: "future" }); close(); }}>
                This &amp; future
              </button>
              <button className="text-xs text-left px-2 py-1.5 rounded hover:bg-destructive/10 text-destructive" onClick={() => { deleteBreakBlock.mutate({ id: deleteConfirm.breakId, scope: "all" }); close(); }}>
                All in series
              </button>
            </div>
          </>
        );
      })()}

      {/* Edit Time Block Modal */}
      {editModal.open && !editModal.isBreak && editModal.block && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getProjectColor(editModal.block.projectId) }} />
                <div>
                  <h2 className="text-lg font-bold">Edit Time Block</h2>
                  <p className="text-sm text-muted-foreground">{editModal.block.projectName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleEditClone}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Clone block"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  onClick={handleEditDelete}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete block"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setEditModal({ open: false, block: null, isBreak: false })} className="p-1.5 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Project</Label>
                <Select value={editForm.projectId} onValueChange={(v) => setEditForm({ ...editForm, projectId: v, phaseId: "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || "#E8772E" }} />
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
                    value={editForm.phaseId || "__none__"}
                    onValueChange={(v) => setEditForm({ ...editForm, phaseId: v === "__none__" ? "" : v })}
                    disabled={!editForm.projectId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Phase…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {editPhases.map((ph) => (
                        <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Sub-phase</Label>
                  <Select value={editForm.subPhase || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, subPhase: v === "__none__" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sub-phase…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {SUB_PHASES.map((sp) => (
                        <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Date</Label>
                  <Input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Start</Label>
                  <Input
                    type="time"
                    step={900}
                    value={editForm.startTime}
                    onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={editForm.hours}
                    onChange={(e) => setEditForm({ ...editForm, hours: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="What did you work on?"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setEditModal({ open: false, block: null, isBreak: false })}>
                Cancel
              </Button>
              <Button onClick={handleEditSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Break Block Modal */}
      {editModal.open && editModal.isBreak && editModal.block && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="h-4 w-4 text-gray-400" />
                <div>
                  <h2 className="text-lg font-bold">Edit Break</h2>
                  <p className="text-sm text-muted-foreground">{editModal.block.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleEditDelete}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete break"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={() => setEditModal({ open: false, block: null, isBreak: false })} className="p-1.5 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={editBreakForm.label} onValueChange={(v) => setEditBreakForm({ ...editBreakForm, label: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lunch">Lunch</SelectItem>
                    <SelectItem value="Break">Break</SelectItem>
                    <SelectItem value="Personal">Personal</SelectItem>
                    <SelectItem value="Dr. Appointment">Dr. Appointment</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Date</Label>
                  <Input
                    type="date"
                    value={editBreakForm.date}
                    onChange={(e) => setEditBreakForm({ ...editBreakForm, date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Start</Label>
                  <Input
                    type="time"
                    step={900}
                    value={editBreakForm.startTime}
                    onChange={(e) => setEditBreakForm({ ...editBreakForm, startTime: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min={0.25}
                    max={8}
                    step={0.25}
                    value={editBreakForm.hours}
                    onChange={(e) => setEditBreakForm({ ...editBreakForm, hours: e.target.value })}
                  />
                </div>
              </div>

              {editModal.block.seriesId && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                  <Repeat className="h-3 w-3" />
                  <span>Part of a recurring series ({editModal.block.recurrenceRule})</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setEditModal({ open: false, block: null, isBreak: false })}>
                Cancel
              </Button>
              <Button onClick={handleEditBreakSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
