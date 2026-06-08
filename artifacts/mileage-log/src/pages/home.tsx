import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  Truck, Filter, Printer, Download, Loader2, ChevronDown, Check, ChevronsUpDown,
  Plus, Save, CheckCircle2, Lock, Unlock, ChevronUp, ArrowUpDown, Archive,
  Clock, AlertTriangle, X,
} from "lucide-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  getGetMileageSummaryQueryOptions,
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useCreateProject,
  useCreateTeamLeader,
  useListPeriods,
  useGetOrCreatePeriod,
  useListPeriodAnnotations,
  useFinalizePeriod,
  useMarkAnnotationsExported,
  useUpsertAnnotation,
  useUpdateAnnotation,
  useVerifyManagerPassword,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const now = new Date();
const DEFAULT_FROM = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
const DEFAULT_TO   = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

interface RowAnnotation {
  indirect: string;
  personal: string;
  direct:   string;
  project:  string;
  leader:   string;
}

type SortKey = "date" | "vehicle" | "indirect" | "project" | "leader";

interface GpsRow {
  key:        string;
  deviceId:   string;
  deviceName: string;
  date:       string;
  beginOdo:   number;
  endOdo:     number;
  gpsMiles:   number;
}

interface ArchiveRow extends GpsRow {
  annotationId: number;
  isExported:   boolean;
}

const EMPTY_ANN: RowAnnotation = { indirect: "", personal: "", direct: "", project: "", leader: "" };

function applySort<T extends { date: string; deviceName: string; key: string }>(
  rows: T[],
  key: SortKey | null,
  dir: "asc" | "desc",
  getAnn: (k: string) => RowAnnotation,
): T[] {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const annA = getAnn(a.key);
    const annB = getAnn(b.key);
    let va: string | number;
    let vb: string | number;
    switch (key) {
      case "date":     va = a.date;                        vb = b.date;                        break;
      case "vehicle":  va = a.deviceName.toLowerCase();    vb = b.deviceName.toLowerCase();    break;
      case "indirect": va = parseFloat(annA.indirect) || 0; vb = parseFloat(annB.indirect) || 0; break;
      case "project":  va = annA.project.toLowerCase();    vb = annB.project.toLowerCase();    break;
      case "leader":   va = annA.leader.toLowerCase();     vb = annB.leader.toLowerCase();     break;
      default: return 0;
    }
    const cmp = typeof va === "number" ? va - vb : va.localeCompare(vb as string);
    return dir === "asc" ? cmp : -cmp;
  });
}

interface ComboboxProps {
  value:       string;
  onChange:    (v: string) => void;
  options:     string[];
  placeholder: string;
  disabled?:   boolean;
  allowNew?:   boolean;
  onCreateNew?: (v: string) => Promise<void>;
}

function Combobox({ value, onChange, options, placeholder, disabled, allowNew, onCreateNew }: ComboboxProps) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const isNew = allowNew && search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (v: string) => { onChange(v); setOpen(false); setSearch(""); };
  const handleCreate = async () => {
    if (!onCreateNew || !search.trim()) return;
    setCreating(true);
    try { await onCreateNew(search.trim()); onChange(search.trim()); setOpen(false); setSearch(""); }
    finally { setCreating(false); }
  };

  if (disabled) {
    return (
      <div className="w-full h-full px-2 text-xs flex items-center text-white/60 truncate">
        {value || <span className="text-white/20">{placeholder}</span>}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "w-full h-full text-left px-2 text-xs flex items-center justify-between gap-1 bg-transparent hover:bg-white/10 transition-colors rounded",
          !value && "text-white/30",
        )}>
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0 z-50" align="start">
        <Command>
          <CommandInput placeholder="Search…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              {isNew
                ? <button onClick={handleCreate} disabled={creating}
                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/60 text-primary">
                    {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Add "{search.trim()}"
                  </button>
                : <p className="text-center text-xs text-muted-foreground py-3">No results.</p>}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem key={opt} value={opt} onSelect={() => handleSelect(opt)}>
                  <Check className={cn("mr-2 h-3 w-3", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
              {isNew && filtered.length > 0 && (
                <CommandItem value={`__new__${search}`} onSelect={handleCreate} className="text-primary">
                  {creating ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-2 h-3 w-3" />}
                  Add "{search.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function Home() {
  const qc = useQueryClient();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom]   = useState(DEFAULT_FROM);
  const [dateTo, setDateTo]       = useState(DEFAULT_TO);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [truckOpen, setTruckOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Annotation state (current GPS view) ────────────────────────────────────
  const [annotations, setAnnotations]           = useState<Record<string, RowAnnotation>>({});
  const [savedAnnotationMap, setSavedAnnotationMap] = useState<Record<string, { id: number; is_exported: boolean }>>({});

  // ── Period & archive state ──────────────────────────────────────────────────
  const [activePeriodId, setActivePeriodId]   = useState<number | null>(null);
  const [viewMode, setViewMode]               = useState<"current" | "archive">("current");
  const [archivePeriodId, setArchivePeriodId] = useState<number | null>(null);
  const [archiveEdits, setArchiveEdits]       = useState<Record<string, RowAnnotation>>({});
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);

  // ── Sort state ──────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── UI state ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal]     = useState(false);
  const [unlockToken, setUnlockToken]         = useState<string | null>(null);
  const [passwordInput, setPasswordInput]     = useState("");
  const [passwordError, setPasswordError]     = useState("");
  const [exportNewOnly, setExportNewOnly]     = useState(true);
  const [isGenerating, setIsGenerating]       = useState(false);

  const loadedPeriodRef  = useRef<number | null>(null);
  const loadedArchiveRef = useRef<number | null>(null);

  // ── API queries / mutations ─────────────────────────────────────────────────
  const { data: devices = [],  isLoading: devicesLoading } = useGetGpsDevices();
  const { data: projects = [] }    = useListProjects();
  const { data: teamLeaders = [] } = useListTeamLeaders();
  const { data: periods = [] }     = useListPeriods();
  const projectOptions = useMemo(() => projects.map(p => p.project_number), [projects]);
  const leaderOptions  = useMemo(() => teamLeaders.map(t => t.name), [teamLeaders]);

  const createProject      = useCreateProject();
  const createLeader       = useCreateTeamLeader();
  const getOrCreatePeriodM = useGetOrCreatePeriod();
  const finalizePeriodMut  = useFinalizePeriod();
  const markExportedMut    = useMarkAnnotationsExported();
  const upsertAnnotationM  = useUpsertAnnotation();
  const updateAnnotationM  = useUpdateAnnotation();
  const verifyPasswordM    = useVerifyManagerPassword();

  const { data: periodAnnotations } = useListPeriodAnnotations(
    activePeriodId ?? 0,
    { query: { enabled: activePeriodId !== null } },
  );
  const { data: archiveAnnotations, isFetching: archiveFetching } = useListPeriodAnnotations(
    archivePeriodId ?? 0,
    { query: { enabled: archivePeriodId !== null } },
  );

  // ── Period info ─────────────────────────────────────────────────────────────
  const currentPeriod = periods.find(p => p.id === activePeriodId)  ?? null;
  const archivePeriod = periods.find(p => p.id === archivePeriodId) ?? null;
  const isFinalized   = (viewMode === "current" ? currentPeriod?.finalized : archivePeriod?.finalized) ?? false;

  // ── Effect: load annotations for current period (once per period id) ────────
  useEffect(() => {
    if (!periodAnnotations || activePeriodId === null) return;
    if (loadedPeriodRef.current === activePeriodId) return;
    loadedPeriodRef.current = activePeriodId;

    const newSaved: Record<string, { id: number; is_exported: boolean }> = {};
    const newAnnotations: Record<string, RowAnnotation> = {};
    for (const ann of periodAnnotations) {
      const key = `${ann.device_id}_${ann.date}`;
      newSaved[key] = { id: ann.id, is_exported: ann.is_exported };
      newAnnotations[key] = {
        indirect: ann.indirect_miles > 0 ? String(ann.indirect_miles) : "",
        personal: ann.personal_miles > 0 ? String(ann.personal_miles) : "",
        direct:   ann.direct_miles   > 0 ? String(ann.direct_miles)   : "",
        project:  ann.project_number,
        leader:   ann.team_leader_name,
      };
    }
    setSavedAnnotationMap(newSaved);
    setAnnotations(newAnnotations);
  }, [periodAnnotations, activePeriodId]);

  // ── Effect: load archive period annotations (once per switch) ───────────────
  useEffect(() => {
    if (!archiveAnnotations || archivePeriodId === null) return;
    if (loadedArchiveRef.current === archivePeriodId) return;
    loadedArchiveRef.current = archivePeriodId;

    const edits: Record<string, RowAnnotation> = {};
    for (const ann of archiveAnnotations) {
      const key = `${ann.device_id}_${ann.date}`;
      edits[key] = {
        indirect: ann.indirect_miles > 0 ? String(ann.indirect_miles) : "",
        personal: ann.personal_miles > 0 ? String(ann.personal_miles) : "",
        direct:   String(ann.direct_miles),
        project:  ann.project_number,
        leader:   ann.team_leader_name,
      };
    }
    setArchiveEdits(edits);
    setUnlockToken(null);
  }, [archiveAnnotations, archivePeriodId]);

  // ── GPS data ────────────────────────────────────────────────────────────────
  const activeIds = submitted ? selectedIds : [];
  const queries   = useQueries({
    queries: activeIds.map(deviceId =>
      getGetMileageSummaryQueryOptions({ device_id: deviceId, from: dateFrom, to: dateTo })
    ),
  });
  const isLoadingGPS = submitted && queries.some(q => q.isFetching);

  const allRows = useMemo((): GpsRow[] => {
    if (!submitted) return [];
    const rows: GpsRow[] = [];
    queries.forEach((q, i) => {
      if (!q.data) return;
      const deviceId   = activeIds[i];
      const deviceName = devices.find(d => d.device_id === deviceId)?.display_name ?? deviceId;
      (q.data.daily_logs ?? [])
        .filter(l => l.miles_driven > 0)
        .forEach(l => rows.push({
          key:      `${deviceId}_${l.date}`,
          deviceId,
          deviceName,
          date:     l.date,
          beginOdo: l.start_odometer_miles,
          endOdo:   l.end_odometer_miles,
          gpsMiles: l.miles_driven,
        }));
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.deviceName.localeCompare(b.deviceName));
  }, [queries, submitted, activeIds, devices]);

  // ── Archive rows from DB ─────────────────────────────────────────────────────
  const archiveRows = useMemo((): ArchiveRow[] => {
    if (!archiveAnnotations) return [];
    return archiveAnnotations.map(ann => ({
      key:          `${ann.device_id}_${ann.date}`,
      annotationId: ann.id,
      deviceId:     ann.device_id,
      deviceName:   ann.device_name,
      date:         ann.date,
      beginOdo:     ann.begin_odometer ?? 0,
      endOdo:       ann.end_odometer   ?? 0,
      gpsMiles:     ann.gps_miles      ?? 0,
      isExported:   ann.is_exported,
    }));
  }, [archiveAnnotations]);

  // ── Annotation getters ──────────────────────────────────────────────────────
  const getAnnotation = useCallback((key: string): RowAnnotation =>
    annotations[key] ?? EMPTY_ANN, [annotations]);

  const getArchiveAnnotation = useCallback((key: string): RowAnnotation =>
    archiveEdits[key] ?? EMPTY_ANN, [archiveEdits]);

  // ── Sorted display rows ─────────────────────────────────────────────────────
  const displayedRows = useMemo(
    () => applySort(allRows, sortKey, sortDir, getAnnotation),
    [allRows, sortKey, sortDir, getAnnotation],
  );

  const archiveDisplayRows = useMemo(
    () => applySort(archiveRows, sortKey, sortDir, getArchiveAnnotation),
    [archiveRows, sortKey, sortDir, getArchiveAnnotation],
  );

  // ── Truck selector ──────────────────────────────────────────────────────────
  const isAllSelected = selectedIds.length === devices.length && devices.length > 0;
  const toggleTruck   = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedIds(isAllSelected ? [] : devices.map(d => d.device_id));

  const truckLabel = devicesLoading         ? "Loading trucks…"
    : selectedIds.length === 0             ? "Select trucks…"
    : isAllSelected                        ? "All Trucks"
    : selectedIds.length === 1            ? devices.find(d => d.device_id === selectedIds[0])?.display_name ?? "1 truck"
    :                                        `${selectedIds.length} trucks`;

  // ── Sort toggle ─────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleCreateProject = async (name: string) => {
    await createProject.mutateAsync({ data: { project_number: name } });
    qc.invalidateQueries({ queryKey: ["/api/projects"] });
  };
  const handleCreateLeader = async (name: string) => {
    await createLeader.mutateAsync({ data: { name } });
    qc.invalidateQueries({ queryKey: ["/api/team-leaders"] });
  };

  const setAnnotation = useCallback((key: string, field: keyof RowAnnotation, value: string) => {
    setAnnotations(prev => ({ ...prev, [key]: { ...EMPTY_ANN, ...prev[key], [field]: value } }));
  }, []);

  const setArchiveAnnotation = useCallback((key: string, field: keyof RowAnnotation, value: string) => {
    setArchiveEdits(prev => ({ ...prev, [key]: { ...EMPTY_ANN, ...prev[key], [field]: value } }));
  }, []);

  const handleGenerate = async () => {
    if (selectedIds.length === 0 || !dateFrom || !dateTo) return;
    setIsGenerating(true);
    try {
      const monthKey = dateFrom.slice(0, 7);
      const period   = await getOrCreatePeriodM.mutateAsync({ data: { month_key: monthKey } });
      if (activePeriodId !== period.id) {
        setActivePeriodId(period.id);
        loadedPeriodRef.current = null;
        setAnnotations({});
        setSavedAnnotationMap({});
      }
      setViewMode("current");
      setSubmitted(false);
      setTimeout(() => setSubmitted(true), 0);
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAll = async () => {
    if (!activePeriodId || displayedRows.length === 0) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const newSaved = { ...savedAnnotationMap };
      for (const row of displayedRows) {
        const ann    = getAnnotation(row.key);
        const direct = ann.direct !== "" ? parseFloat(ann.direct) : row.gpsMiles;
        const result = await upsertAnnotationM.mutateAsync({
          data: {
            period_id:        activePeriodId,
            device_id:        row.deviceId,
            device_name:      row.deviceName,
            date:             row.date,
            begin_odometer:   row.beginOdo,
            end_odometer:     row.endOdo,
            gps_miles:        row.gpsMiles,
            indirect_miles:   parseFloat(ann.indirect) || 0,
            personal_miles:   parseFloat(ann.personal) || 0,
            direct_miles:     direct,
            project_number:   ann.project,
            team_leader_name: ann.leader,
          },
        });
        newSaved[row.key] = { id: result.id, is_exported: result.is_exported };
      }
      setSavedAnnotationMap(newSaved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveArchive = async () => {
    if (!archivePeriodId) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      for (const row of archiveRows) {
        const ann    = archiveEdits[row.key];
        if (!ann) continue;
        const direct = ann.direct !== "" ? parseFloat(ann.direct) : row.gpsMiles;
        await updateAnnotationM.mutateAsync({
          id:   row.annotationId,
          data: {
            indirect_miles:   parseFloat(ann.indirect) || 0,
            personal_miles:   parseFloat(ann.personal) || 0,
            direct_miles:     direct,
            project_number:   ann.project,
            team_leader_name: ann.leader,
            manager_token:    unlockToken ?? undefined,
          },
        });
      }
      qc.invalidateQueries({ queryKey: [`/api/periods/${archivePeriodId}/annotations`] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = async () => {
    const rows = exportNewOnly
      ? displayedRows.filter(r => {
          const saved = savedAnnotationMap[r.key];
          return !saved || !saved.is_exported;
        })
      : displayedRows;
    if (!rows.length) return;

    const headers = [
      "DATE","VEHICLE","BEGIN ODOMETER","END ODOMETER","INDIRECT",
      "PERSONAL/UNALLOWABLE","JOB (DIRECT)","PROJECT NUMBER","TOTAL MILES","TEAM LEADER",
    ];
    const csvRows = rows.map(r => {
      const ann      = getAnnotation(r.key);
      const indirect = parseFloat(ann.indirect) || 0;
      const personal = parseFloat(ann.personal) || 0;
      const direct   = ann.direct !== "" ? parseFloat(ann.direct) : r.gpsMiles;
      const total    = indirect + personal + direct;
      return [
        r.date, r.deviceName,
        r.beginOdo.toFixed(1), r.endOdo.toFixed(1),
        indirect > 0 ? indirect.toFixed(1) : "",
        personal > 0 ? personal.toFixed(1) : "",
        direct.toFixed(1), ann.project, total.toFixed(1), ann.leader,
      ];
    });
    const csv  = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `mileage-log-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark saved rows as exported
    if (activePeriodId) {
      const idsToMark = rows
        .map(r => savedAnnotationMap[r.key]?.id)
        .filter((id): id is number => id !== undefined);
      if (idsToMark.length > 0) {
        await markExportedMut.mutateAsync({ id: activePeriodId, data: { annotation_ids: idsToMark } });
        setSavedAnnotationMap(prev => {
          const next = { ...prev };
          for (const [key, val] of Object.entries(next)) {
            if (idsToMark.includes(val.id)) next[key] = { ...val, is_exported: true };
          }
          return next;
        });
      }
    }
  };

  const handleFinalize = async () => {
    if (!activePeriodId) return;
    await finalizePeriodMut.mutateAsync({ id: activePeriodId });
    qc.invalidateQueries({ queryKey: ["/api/periods"] });
    setShowFinalizeConfirm(false);
  };

  const handleVerifyPassword = async () => {
    setPasswordError("");
    const result = await verifyPasswordM.mutateAsync({
      data: { password: passwordInput, period_id: archivePeriodId! },
    });
    if (result.valid && result.token) {
      setUnlockToken(result.token);
      setShowPasswordModal(false);
      setPasswordInput("");
    } else {
      setPasswordError("Incorrect password. Try again.");
    }
  };

  const handleSwitchToArchive = (id: number) => {
    if (archivePeriodId !== id) {
      setArchivePeriodId(id);
      loadedArchiveRef.current = null;
      setArchiveEdits({});
      setUnlockToken(null);
    }
    setViewMode("archive");
    setPeriodSelectorOpen(false);
  };

  // ── Computed stats ──────────────────────────────────────────────────────────
  const savedCount = displayedRows.filter(r => savedAnnotationMap[r.key]).length;
  const grandTotal = displayedRows.reduce((sum, r) => {
    const ann = getAnnotation(r.key);
    return sum + (parseFloat(ann.indirect) || 0) + (parseFloat(ann.personal) || 0) +
           (ann.direct !== "" ? parseFloat(ann.direct) : r.gpsMiles);
  }, 0);

  const archiveGrandTotal = archiveDisplayRows.reduce((sum, r) => {
    const ann = getArchiveAnnotation(r.key);
    return sum + (parseFloat(ann.indirect) || 0) + (parseFloat(ann.personal) || 0) +
           (ann.direct !== "" ? parseFloat(ann.direct) : r.gpsMiles);
  }, 0);
  void archiveGrandTotal;

  // ── Period label badge ──────────────────────────────────────────────────────
  const periodBadge = () => {
    if (viewMode === "archive" && archivePeriod) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-mono text-white/40">
          <Archive className="h-3 w-3" />
          {archivePeriod.label}
          <span className="text-amber-500/70 ml-1">Finalized</span>
        </span>
      );
    }
    if (currentPeriod) {
      return currentPeriod.finalized
        ? <span className="flex items-center gap-1.5 text-xs font-mono text-white/40">
            <Lock className="h-3 w-3" />{currentPeriod.label}
            <span className="text-amber-500/70 ml-1">Finalized</span>
          </span>
        : <span className="flex items-center gap-1.5 text-xs font-mono text-white/40">
            <Clock className="h-3 w-3" />{currentPeriod.label}
            <span className="text-emerald-400/70 ml-1">In Progress</span>
          </span>;
    }
    return null;
  };

  // ── Sort header components ──────────────────────────────────────────────────
  const SortableTh = ({ col, label, cls = "" }: { col: SortKey; label: string; cls?: string }) => (
    <th onClick={() => toggleSort(col)}
      className={cn(
        "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors hover:text-white/60",
        sortKey === col ? "text-amber-400" : "text-white/35",
        cls,
      )}>
      <span className="flex items-center gap-0.5">
        {label}
        {sortKey === col
          ? sortDir === "asc"
            ? <ChevronUp className="h-3 w-3 ml-0.5" />
            : <ChevronDown className="h-3 w-3 ml-0.5" />
          : <ArrowUpDown className="h-3 w-3 ml-0.5 opacity-25" />}
      </span>
    </th>
  );

  const StaticTh = ({ label, cls = "" }: { label: string; cls?: string }) => (
    <th className={cn("px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/35 whitespace-nowrap", cls)}>
      {label}
    </th>
  );

  // ── Shared table head ───────────────────────────────────────────────────────
  const tableHead = (
    <thead>
      <tr className="border-b border-white/10 bg-white/5">
        <th className="w-7 px-2" />
        <SortableTh col="date"     label="Date"                    cls="w-[110px]" />
        <SortableTh col="vehicle"  label="Vehicle"                 cls="w-[110px]" />
        <StaticTh   label="Begin Odo"                              cls="w-[100px] text-right" />
        <StaticTh   label="End Odo"                                cls="w-[100px] text-right" />
        <SortableTh col="indirect" label="Indirect"                cls="w-[90px]" />
        <StaticTh   label="Personal / Unallowable"                 cls="w-[90px]" />
        <StaticTh   label="Job (Direct)"                           cls="w-[90px]" />
        <SortableTh col="project"  label="Project Number"          cls="w-[180px]" />
        <StaticTh   label="Total Miles"                            cls="w-[90px] text-right" />
        <SortableTh col="leader"   label="Team Leader"             cls="w-[160px]" />
      </tr>
    </thead>
  );

  // ── Row renderer ────────────────────────────────────────────────────────────
  function renderRow(
    row: GpsRow,
    i: number,
    ann: RowAnnotation,
    setAnn: (key: string, field: keyof RowAnnotation, val: string) => void,
    savedInfo?: { id: number; is_exported: boolean },
    readonly = false,
  ) {
    const indirect = parseFloat(ann.indirect) || 0;
    const personal = parseFloat(ann.personal) || 0;
    const direct   = ann.direct !== "" ? parseFloat(ann.direct) : row.gpsMiles;
    const total    = indirect + personal + direct;

    return (
      <tr key={row.key}
        className={cn("border-b border-white/5 hover:bg-white/[0.03] transition-colors",
          i % 2 !== 0 && "bg-white/[0.015]")}>
        {/* Status */}
        <td className="px-2 py-1.5 w-7">
          {savedInfo && (
            <CheckCircle2
              className={cn("h-3.5 w-3.5",
                savedInfo.is_exported ? "text-white/20" : "text-emerald-400/70")}
              title={savedInfo.is_exported ? "Saved & exported" : "Saved"}
            />
          )}
        </td>
        {/* DATE */}
        <td className="px-3 py-1.5 font-mono text-xs text-white/70 whitespace-nowrap">{row.date}</td>
        {/* VEHICLE */}
        <td className="px-3 py-1.5 text-xs text-amber-400/80 whitespace-nowrap">{row.deviceName}</td>
        {/* BEGIN ODO */}
        <td className="px-3 py-1.5 font-mono text-xs text-white/40 text-right">{row.beginOdo.toFixed(1)}</td>
        {/* END ODO */}
        <td className="px-3 py-1.5 font-mono text-xs text-white/40 text-right">{row.endOdo.toFixed(1)}</td>
        {/* INDIRECT */}
        <td className="px-1.5 py-1">
          {readonly
            ? <span className="block px-2 text-xs font-mono text-white/60">{indirect > 0 ? indirect.toFixed(1) : "—"}</span>
            : <Input type="number" min="0" step="0.1" placeholder="—" value={ann.indirect}
                onChange={e => setAnn(row.key, "indirect", e.target.value)}
                className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
        </td>
        {/* PERSONAL */}
        <td className="px-1.5 py-1">
          {readonly
            ? <span className="block px-2 text-xs font-mono text-white/60">{personal > 0 ? personal.toFixed(1) : "—"}</span>
            : <Input type="number" min="0" step="0.1" placeholder="—" value={ann.personal}
                onChange={e => setAnn(row.key, "personal", e.target.value)}
                className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
        </td>
        {/* DIRECT */}
        <td className="px-1.5 py-1">
          {readonly
            ? <span className="block px-2 text-xs font-mono text-white/60">{direct.toFixed(1)}</span>
            : <Input type="number" min="0" step="0.1" placeholder={row.gpsMiles.toFixed(1)} value={ann.direct}
                onChange={e => setAnn(row.key, "direct", e.target.value)}
                className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/40 px-2" />}
        </td>
        {/* PROJECT */}
        <td className="px-1.5 py-1 min-w-[160px]">
          <div className={cn("h-7 rounded border transition-colors",
            readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
            <Combobox value={ann.project} onChange={v => setAnn(row.key, "project", v)}
              options={projectOptions} placeholder="Project…" disabled={readonly}
              allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateProject} />
          </div>
        </td>
        {/* TOTAL */}
        <td className="px-3 py-1.5 font-mono text-xs font-bold text-white text-right whitespace-nowrap">
          {total.toFixed(1)}
        </td>
        {/* TEAM LEADER */}
        <td className="px-1.5 py-1 min-w-[150px]">
          <div className={cn("h-7 rounded border transition-colors",
            readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
            <Combobox value={ann.leader} onChange={v => setAnn(row.key, "leader", v)}
              options={leaderOptions} placeholder="Leader…" disabled={readonly}
              allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateLeader} />
          </div>
        </td>
      </tr>
    );
  }

  // ── Footer renderer ─────────────────────────────────────────────────────────
  function renderFooter(rows: GpsRow[], getAnn: (key: string) => RowAnnotation) {
    const totI = rows.reduce((s, r) => s + (parseFloat(getAnn(r.key).indirect) || 0), 0);
    const totP = rows.reduce((s, r) => s + (parseFloat(getAnn(r.key).personal) || 0), 0);
    const totD = rows.reduce((s, r) => {
      const ann = getAnn(r.key);
      return s + (ann.direct !== "" ? parseFloat(ann.direct) : r.gpsMiles);
    }, 0);
    return (
      <tfoot>
        <tr className="border-t-2 border-amber-500/30 bg-amber-500/5">
          <td className="px-2 py-2" />
          <td colSpan={4} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/35">
            {rows.length} day{rows.length !== 1 ? "s" : ""}
          </td>
          <td className="px-3 py-2 font-mono text-xs font-bold text-white/60">{totI.toFixed(1)}</td>
          <td className="px-3 py-2 font-mono text-xs font-bold text-white/60">{totP.toFixed(1)}</td>
          <td className="px-3 py-2 font-mono text-xs font-bold text-white/80">{totD.toFixed(1)}</td>
          <td className="px-3 py-2" />
          <td className="px-3 py-2 font-mono text-xs font-bold text-amber-400 text-right">{(totI + totP + totD).toFixed(1)}</td>
          <td className="px-3 py-2" />
        </tr>
      </tfoot>
    );
  }

  const finalizedPeriods = periods.filter(p => p.finalized).sort((a, b) => b.month_key.localeCompare(a.month_key));
  const openPeriods      = periods.filter(p => !p.finalized).sort((a, b) => b.month_key.localeCompare(a.month_key));

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1117] text-foreground dark pb-20">

      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1117]/90 backdrop-blur sticky top-0 z-10 print:hidden">
        <div className="container mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Truck className="h-5 w-5 text-amber-400" />
            <span className="font-bold text-base tracking-tight">FleetLog</span>
            <span className="text-xs text-white/30 font-mono ml-1 hidden sm:block">Mileage Log</span>
          </div>

          {/* Period badge */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {periodBadge()}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Period selector */}
            <Popover open={periodSelectorOpen} onOpenChange={setPeriodSelectorOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"
                  className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5">
                  <Archive className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Periods</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[230px] p-2">
                {openPeriods.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/30 px-2 mb-1">Open</p>
                    {openPeriods.map(p => (
                      <button key={p.id}
                        onClick={() => {
                          setViewMode("current"); setActivePeriodId(p.id);
                          loadedPeriodRef.current = null; setPeriodSelectorOpen(false);
                        }}
                        className={cn("w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-muted/60 transition-colors",
                          activePeriodId === p.id && viewMode === "current" && "text-amber-400")}>
                        <Clock className="h-3 w-3 opacity-60 shrink-0" />
                        <span className="flex-1">{p.label}</span>
                        {activePeriodId === p.id && viewMode === "current" && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                )}
                {finalizedPeriods.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/30 px-2 mb-1">Finalized</p>
                    {finalizedPeriods.map(p => (
                      <button key={p.id}
                        onClick={() => handleSwitchToArchive(p.id)}
                        className={cn("w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 hover:bg-muted/60 transition-colors",
                          archivePeriodId === p.id && viewMode === "archive" && "text-amber-400")}>
                        <Lock className="h-3 w-3 opacity-60 shrink-0" />
                        <span className="flex-1">{p.label}</span>
                        {archivePeriodId === p.id && viewMode === "archive" && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                )}
                {periods.length === 0 && (
                  <p className="text-xs text-white/30 px-2 py-3 text-center">No periods yet. Generate a log to start.</p>
                )}
              </PopoverContent>
            </Popover>

            {/* Unlock (archive only) */}
            {viewMode === "archive" && isFinalized && (
              <Button variant="ghost" size="sm"
                onClick={() => unlockToken ? setUnlockToken(null) : setShowPasswordModal(true)}
                className={cn("h-8 text-xs gap-1.5",
                  unlockToken
                    ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    : "text-white/50 hover:text-white hover:bg-white/10")}>
                {unlockToken ? <><Unlock className="h-3.5 w-3.5" />Unlocked</> : <><Lock className="h-3.5 w-3.5" />Unlock</>}
              </Button>
            )}

            {/* Finalize (current, open period with saved rows) */}
            {viewMode === "current" && currentPeriod && !currentPeriod.finalized && savedCount > 0 && (
              <Button variant="ghost" size="sm"
                onClick={() => setShowFinalizeConfirm(true)}
                className="h-8 text-xs text-white/50 hover:text-amber-400 hover:bg-amber-500/10 gap-1.5">
                <Lock className="h-3.5 w-3.5" />Finalize
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={() => window.print()}
              className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10">
              <Printer className="h-3.5 w-3.5" />
            </Button>

            {viewMode === "current" && (
              <Button variant="ghost" size="sm" onClick={handleExportCSV} disabled={!displayedRows.length}
                className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Print header */}
      <div className="hidden print:block text-center py-4 border-b border-black mb-4">
        <h1 className="text-xl font-bold">Fleet Mileage Log</h1>
        <p className="text-sm text-gray-600">{dateFrom} — {dateTo} · Generated {format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      <main className="container mx-auto max-w-7xl px-4 mt-5">

        {/* ── Archive view ─────────────────────────────────────────────────── */}
        {viewMode === "archive" ? (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5 print:hidden">
              <Button variant="outline" size="sm"
                onClick={() => setViewMode("current")}
                className="h-8 text-xs bg-white/5 border-white/10 hover:bg-white/10">
                ← Back to Current Log
              </Button>
              {archivePeriod && (
                <span className="text-sm text-white/40">
                  {archivePeriod.label}
                  {archivePeriod.finalized_at && (
                    <span className="text-xs ml-2">· Finalized {format(new Date(archivePeriod.finalized_at), "MMM d, yyyy")}</span>
                  )}
                </span>
              )}
              <div className="flex-1" />
              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />Saved
                </span>
              )}
              {unlockToken && (
                <Button onClick={handleSaveArchive} disabled={isSaving}
                  className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5">
                  {isSaving
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                    : <><Save className="h-3.5 w-3.5" />Save Changes</>}
                </Button>
              )}
            </div>

            {unlockToken && (
              <div className="mb-4 flex items-center gap-2 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <Unlock className="h-3.5 w-3.5 shrink-0" />
                Editing unlocked — changes here do not affect GPS odometer readings.
              </div>
            )}

            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  {tableHead}
                  <tbody>
                    {archiveFetching ? (
                      <tr><td colSpan={11} className="py-20 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-400/50" />
                        <p className="text-white/30 text-sm">Loading archive…</p>
                      </td></tr>
                    ) : archiveDisplayRows.length === 0 ? (
                      <tr><td colSpan={11} className="py-20 text-center">
                        <p className="text-white/30 text-sm">No data saved for this period.</p>
                      </td></tr>
                    ) : archiveDisplayRows.map((row, i) =>
                        renderRow(row, i, getArchiveAnnotation(row.key), setArchiveAnnotation,
                          { id: row.annotationId, is_exported: row.isExported }, !unlockToken)
                      )
                    }
                  </tbody>
                  {archiveDisplayRows.length > 0 && !archiveFetching &&
                    renderFooter(archiveDisplayRows, getArchiveAnnotation)}
                </table>
              </div>
            </div>
          </>

        ) : (
          <>
            {/* ── Current log controls ──────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-3 mb-5 print:hidden">
              {/* Truck selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">Vehicles</Label>
                <Popover open={truckOpen} onOpenChange={setTruckOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" disabled={devicesLoading}
                      className="h-9 min-w-[180px] justify-between bg-white/5 border-white/10 hover:bg-white/10 text-sm font-normal">
                      <span className={cn(!selectedIds.length && "text-white/40")}>{truckLabel}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-2" align="start">
                    <div className="space-y-0.5">
                      <button onClick={toggleAll}
                        className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors">
                        <div className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isAllSelected ? "bg-amber-500 border-amber-500" : "border-white/30")}>
                          {isAllSelected && <Check className="h-2.5 w-2.5 text-black" />}
                        </div>
                        <span className="font-medium">All Trucks</span>
                      </button>
                      <div className="h-px bg-white/10 my-1" />
                      {devices.map(d => (
                        <button key={d.device_id} onClick={() => toggleTruck(d.device_id)}
                          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors">
                          <div className={cn("h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                            selectedIds.includes(d.device_id) ? "bg-amber-500 border-amber-500" : "border-white/30")}>
                            {selectedIds.includes(d.device_id) && <Check className="h-2.5 w-2.5 text-black" />}
                          </div>
                          <span>{d.display_name}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Date range */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">From</Label>
                <Input type="date" value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setSubmitted(false); }}
                  className="h-9 w-[150px] bg-white/5 border-white/10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">To</Label>
                <Input type="date" value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setSubmitted(false); }}
                  className="h-9 w-[150px] bg-white/5 border-white/10 text-sm" />
              </div>

              <Button onClick={handleGenerate}
                disabled={selectedIds.length === 0 || !dateFrom || !dateTo || isLoadingGPS || isGenerating}
                className="h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm">
                {isGenerating || isLoadingGPS
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Loading…</>
                  : <><Filter className="h-4 w-4 mr-1.5" />Generate Log</>}
              </Button>

              {/* Save All */}
              {submitted && !isLoadingGPS && displayedRows.length > 0 && activePeriodId && !isFinalized && (
                <Button onClick={handleSaveAll} disabled={isSaving} variant="outline"
                  className="h-9 text-sm border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 gap-1.5">
                  {isSaving
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                    : <><Save className="h-4 w-4" />Save All</>}
                </Button>
              )}

              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 self-end pb-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />All rows saved
                </span>
              )}

              {/* Stats */}
              {submitted && !isLoadingGPS && displayedRows.length > 0 && (
                <div className="flex items-center gap-3 self-end pb-2 ml-auto">
                  {savedCount > 0 && (
                    <span className="text-xs text-white/30">
                      <span className="text-emerald-400/70 font-mono">{savedCount}</span>/{displayedRows.length} saved
                    </span>
                  )}
                  <span className="text-xs text-white/40">
                    {displayedRows.length} day{displayedRows.length !== 1 ? "s" : ""} ·{" "}
                    <span className="text-amber-400 font-mono font-semibold">{grandTotal.toFixed(1)} mi</span>
                  </span>
                </div>
              )}
            </div>

            {/* Export new-only toggle */}
            {submitted && !isLoadingGPS && displayedRows.length > 0 && (
              <div className="mb-3 print:hidden">
                <button
                  onClick={() => setExportNewOnly(v => !v)}
                  className={cn("flex items-center gap-2 text-xs px-2.5 py-1 rounded border transition-colors",
                    exportNewOnly
                      ? "border-amber-500/30 text-amber-400/80 bg-amber-500/5"
                      : "border-white/10 text-white/30 hover:border-white/20")}>
                  <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                    exportNewOnly ? "bg-amber-500 border-amber-500" : "border-white/30")}>
                    {exportNewOnly && <Check className="h-2.5 w-2.5 text-black" />}
                  </div>
                  Export only rows not yet exported
                </button>
              </div>
            )}

            {/* Finalize confirmation */}
            {showFinalizeConfirm && (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-300">Finalize {currentPeriod?.label}?</p>
                    <p className="text-xs text-white/50 mt-1">
                      This locks all {savedCount} saved rows into a read-only archive.
                      A manager password will be required to make any future edits.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button onClick={handleFinalize} disabled={finalizePeriodMut.isPending}
                        className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold">
                        {finalizePeriodMut.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : "Confirm & Finalize"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowFinalizeConfirm(false)}
                        className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10">
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <button onClick={() => setShowFinalizeConfirm(false)} className="text-white/30 hover:text-white/60">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* GPS table */}
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  {tableHead}
                  <tbody>
                    {!submitted ? (
                      <tr><td colSpan={11} className="py-20 text-center">
                        <Truck className="h-8 w-8 mx-auto mb-3 text-white/10" />
                        <p className="text-white/25 text-sm">Select trucks and a date range, then click Generate Log.</p>
                      </td></tr>
                    ) : isLoadingGPS ? (
                      <tr><td colSpan={11} className="py-20 text-center">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-400/50" />
                        <p className="text-white/30 text-sm">Pulling GPS data…</p>
                      </td></tr>
                    ) : displayedRows.length === 0 ? (
                      <tr><td colSpan={11} className="py-20 text-center">
                        <p className="text-white/30 text-sm">No driving days found for the selected period.</p>
                      </td></tr>
                    ) : displayedRows.map((row, i) =>
                        renderRow(row, i, getAnnotation(row.key), setAnnotation,
                          savedAnnotationMap[row.key], isFinalized)
                      )
                    }
                  </tbody>
                  {displayedRows.length > 0 && !isLoadingGPS &&
                    renderFooter(displayedRows, getAnnotation)}
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Password modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowPasswordModal(false); setPasswordInput(""); setPasswordError(""); } }}>
          <div className="bg-[#161b22] border border-white/10 rounded-xl p-6 w-[340px] shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-amber-400" />
              <h2 className="text-sm font-semibold">Manager Password Required</h2>
            </div>
            <p className="text-xs text-white/40 mb-4">
              Enter the manager password to unlock editing for this finalized period.
            </p>
            <Input
              type="password"
              placeholder="Password…"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(""); }}
              onKeyDown={e => e.key === "Enter" && handleVerifyPassword()}
              className="mb-2 bg-white/5 border-white/10 focus:border-amber-500/50"
              autoFocus
            />
            {passwordError && (
              <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{passwordError}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleVerifyPassword} disabled={!passwordInput || verifyPasswordM.isPending}
                className="flex-1 h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm">
                {verifyPasswordM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
              </Button>
              <Button variant="ghost"
                onClick={() => { setShowPasswordModal(false); setPasswordInput(""); setPasswordError(""); }}
                className="h-9 text-sm text-white/50 hover:text-white hover:bg-white/10">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
