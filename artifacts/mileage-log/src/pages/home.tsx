import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  Truck, Filter, Printer, Download, Loader2, ChevronDown, Check, ChevronsUpDown,
  Plus, Save, CheckCircle2, ChevronUp, ArrowUpDown,
  AlertTriangle, X, User, Scissors, Lock, Clock, Archive, FileText, Settings,
} from "lucide-react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  getGetMileageSummaryQueryOptions,
  getListPeriodAnnotationsQueryOptions,
  getListDriverSessionsQueryOptions,
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useCreateProject,
  useCreateTeamLeader,
  useGetOrCreatePeriod,
  useUpsertAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
  useSyncGpsCache,
  useListPeriods,
  useFinalizePeriod,
  useMarkAnnotationsExported,
  useVerifyManagerPassword,
  useListAlerts,
  useDismissAlert,
  useTriggerAlertCheck,
  getListAlertsQueryKey,
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
  allocated: string;
  indirect:  string;
  personal:  string;
  direct:    string;
  project:   string;
  leader:    string;
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

const EMPTY_ANN: RowAnnotation = { allocated: "", indirect: "", personal: "", direct: "", project: "", leader: "" };

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
    const cmp = typeof va === "number" ? (va as number) - (vb as number) : (va as string).localeCompare(vb as string);
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
  const [extraSplits, setExtraSplits]           = useState<Record<string, RowAnnotation[]>>({});
  const [savedAnnotationMap, setSavedAnnotationMap] = useState<Record<string, { id: number; is_exported: boolean; splitIds?: number[] }>>({});

  const [, navigate] = useLocation();

  // ── Period & archive state ──────────────────────────────────────────────────
  const [activePeriodId, setActivePeriodId]   = useState<number | null>(null);
  const [viewMode, setViewMode]               = useState<"current" | "archive">("current");
  const [archivePeriodId, setArchivePeriodId] = useState<number | null>(null);
  const [archiveEdits, setArchiveEdits]       = useState<Record<string, RowAnnotation>>({});
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);

  // ── Sort state ──────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Driver-session auto-fill state ──────────────────────────────────────────
  const [sessionPrefilled, setSessionPrefilled] = useState<Set<string>>(new Set());
  const [sessionMultiple, setSessionMultiple]   = useState<Set<string>>(new Set());

  // ── Alert banner state ──────────────────────────────────────────────────────
  const [alertsBannerExpanded, setAlertsBannerExpanded] = useState(true);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving]               = useState(false);
  const [saveSuccess, setSaveSuccess]         = useState(false);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [showPasswordModal, setShowPasswordModal]     = useState(false);
  const [unlockToken, setUnlockToken]         = useState<string | null>(null);
  const [passwordInput, setPasswordInput]     = useState("");
  const [passwordError, setPasswordError]     = useState("");
  const [isGenerating, setIsGenerating]       = useState(false);
  const [projectFilter, setProjectFilter]     = useState("");
  const [leaderFilter, setLeaderFilter]       = useState("");
  const [showProjectReports, setShowProjectReports]       = useState(false);
  const [selectedReportProjects, setSelectedReportProjects] = useState<Set<string>>(new Set());
  const [projectFilterOpen, setProjectFilterOpen] = useState(false);
  const [leaderFilterOpen, setLeaderFilterOpen]   = useState(false);

  const loadedPeriodRef  = useRef<number | null>(null);
  const loadedArchiveRef = useRef<number | null>(null);
  // Tracks keys already auto-filled from driver sessions so the effect bails out
  // immediately on subsequent renders when nothing new needs filling.
  const autoFilledKeysRef = useRef<Set<string>>(new Set());

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
  const deleteAnnotationM  = useDeleteAnnotation();
  const verifyPasswordM    = useVerifyManagerPassword();
  const syncGpsCacheMut    = useSyncGpsCache();
  const { data: alerts = [] } = useListAlerts();
  const dismissAlertMut       = useDismissAlert();
  const checkNowMut           = useTriggerAlertCheck();

  const { data: periodAnnotations } = useQuery({
    ...getListPeriodAnnotationsQueryOptions(activePeriodId ?? 0),
    enabled: activePeriodId !== null,
  });
  const { data: archiveAnnotations, isFetching: archiveFetching } = useQuery({
    ...getListPeriodAnnotationsQueryOptions(archivePeriodId ?? 0),
    enabled: archivePeriodId !== null,
  });

  // ── Driver sessions for auto-fill ───────────────────────────────────────────
  const { data: driverSessions = [] } = useQuery({
    ...getListDriverSessionsQueryOptions({ from: dateFrom, to: dateTo }),
    enabled: submitted && !!dateFrom && !!dateTo,
  });

  // ── Period info ─────────────────────────────────────────────────────────────
  const currentPeriod = periods.find(p => p.id === activePeriodId)  ?? null;
  const archivePeriod = periods.find(p => p.id === archivePeriodId) ?? null;
  const isFinalized   = (viewMode === "current" ? currentPeriod?.finalized : archivePeriod?.finalized) ?? false;

  // ── Effect: load annotations for current period (once per period id) ────────
  useEffect(() => {
    if (!periodAnnotations || activePeriodId === null) return;
    if (loadedPeriodRef.current === activePeriodId) return;
    loadedPeriodRef.current = activePeriodId;

    // Group by row key, sort each group by split_index
    const byKey: Record<string, typeof periodAnnotations[number][]> = {};
    for (const ann of periodAnnotations) {
      const key = `${ann.device_id}_${ann.date}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(ann);
    }

    const newSaved: Record<string, { id: number; is_exported: boolean; splitIds?: number[] }> = {};
    const newAnnotations: Record<string, RowAnnotation> = {};
    const newExtraSplits: Record<string, RowAnnotation[]> = {};

    for (const [key, anns] of Object.entries(byKey)) {
      const sorted = [...anns].sort((a, b) => a.split_index - b.split_index);
      const primary  = sorted[0];
      const isSplit  = sorted.length > 1;

      newSaved[key] = {
        id: primary.id,
        is_exported: primary.is_exported,
        splitIds: sorted.slice(1).map(a => a.id),
      };
      newAnnotations[key] = {
        allocated: isSplit ? String(primary.indirect_miles + primary.personal_miles + primary.direct_miles) : "",
        indirect:  primary.indirect_miles !== 0 ? String(primary.indirect_miles) : "",
        personal:  primary.personal_miles !== 0 ? String(primary.personal_miles) : "",
        direct:    String(primary.direct_miles),
        project:   primary.project_number,
        leader:    primary.team_leader_name,
      };
      if (isSplit) {
        newExtraSplits[key] = sorted.slice(1).map(a => ({
          allocated: String(a.indirect_miles + a.personal_miles + a.direct_miles),
          indirect:  a.indirect_miles !== 0 ? String(a.indirect_miles) : "",
          personal:  a.personal_miles !== 0 ? String(a.personal_miles) : "",
          direct:    String(a.direct_miles),
          project:   a.project_number,
          leader:    a.team_leader_name,
        }));
      }
    }

    setSavedAnnotationMap(newSaved);
    setAnnotations(newAnnotations);
    setExtraSplits(newExtraSplits);
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
        allocated: "",
        indirect:  ann.indirect_miles > 0 ? String(ann.indirect_miles) : "",
        personal:  ann.personal_miles > 0 ? String(ann.personal_miles) : "",
        direct:    String(ann.direct_miles),
        project:   ann.project_number,
        leader:    ann.team_leader_name,
      };
    }
    setArchiveEdits(edits);
    setUnlockToken(null);
  }, [archiveAnnotations, archivePeriodId]);

  // ── GPS data ────────────────────────────────────────────────────────────────
  const activeIds = submitted ? selectedIds : [];
  // Memoize the options array so useQueries gets a stable reference across renders.
  // Without this, a new array identity on every render causes useQueries to return
  // a new results array, which makes allRows recompute every render, which triggers
  // the auto-fill effect every render → infinite setState loop.
  const queriesOptions = useMemo(
    () => activeIds.map(deviceId =>
      getGetMileageSummaryQueryOptions({ device_id: deviceId, from: dateFrom, to: dateTo })
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeIds.join(","), dateFrom, dateTo],
  );
  const queries = useQueries({ queries: queriesOptions });
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

  // ── Auto-fill from driver sessions ──────────────────────────────────────────
  // Reset the filled-keys tracker whenever the user resets the form so a new
  // submission gets a fresh fill pass.
  useEffect(() => {
    if (!submitted) autoFilledKeysRef.current = new Set();
  }, [submitted]);

  useEffect(() => {
    if (!submitted || allRows.length === 0 || driverSessions.length === 0) return;

    const prefilled = new Set<string>();
    const multiple  = new Set<string>();
    const toFill: Record<string, { leader: string; project: string }> = {};

    for (const row of allRows) {
      if (savedAnnotationMap[row.key]) continue;
      const matches = driverSessions.filter(
        s => s.device_id === row.deviceId && s.started_at.slice(0, 10) === row.date,
      );
      if (!matches.length) continue;
      if (matches.length > 1) multiple.add(row.key);
      prefilled.add(row.key);
      toFill[row.key] = {
        leader:  matches[0].driver_name,
        project: matches[0].project_number ?? "",
      };
    }

    if (!prefilled.size) return;

    // Guard: if every key was already processed on a previous run of this effect,
    // bail out without calling setState at all. This prevents the loop that occurs
    // when useQueries returns a new array reference on re-renders (making allRows
    // a new reference, re-firing this effect, calling setState, causing another
    // re-render, ad infinitum).
    const hasNew = [...prefilled].some(k => !autoFilledKeysRef.current.has(k));
    if (!hasNew) return;
    prefilled.forEach(k => autoFilledKeysRef.current.add(k));

    // Use functional updaters that bail out (return prev) when content is identical
    // so React skips the re-render entirely when nothing actually changed.
    setSessionPrefilled(prev => {
      if (prev.size === prefilled.size && [...prefilled].every(k => prev.has(k))) return prev;
      return prefilled;
    });
    setSessionMultiple(prev => {
      if (prev.size === multiple.size && [...multiple].every(k => prev.has(k))) return prev;
      return multiple;
    });
    setAnnotations(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, fill] of Object.entries(toFill)) {
        const cur = prev[key] ?? EMPTY_ANN;
        if (!cur.leader && !cur.project) {
          next[key] = { ...EMPTY_ANN, ...cur, leader: fill.leader, project: fill.project };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, driverSessions, submitted]);

  // ── Sorted display rows ─────────────────────────────────────────────────────
  const displayedRows = useMemo(() => {
    let rows = applySort(allRows, sortKey, sortDir, getAnnotation);
    if (projectFilter) rows = rows.filter(r => getAnnotation(r.key).project === projectFilter);
    if (leaderFilter)  rows = rows.filter(r => getAnnotation(r.key).leader  === leaderFilter);
    return rows;
  }, [allRows, sortKey, sortDir, getAnnotation, projectFilter, leaderFilter]);

  const archiveDisplayRows = useMemo(() => {
    let rows = applySort(archiveRows, sortKey, sortDir, getArchiveAnnotation);
    if (projectFilter) rows = rows.filter(r => getArchiveAnnotation(r.key).project === projectFilter);
    if (leaderFilter)  rows = rows.filter(r => getArchiveAnnotation(r.key).leader  === leaderFilter);
    return rows;
  }, [archiveRows, sortKey, sortDir, getArchiveAnnotation, projectFilter, leaderFilter]);

  // ── Projects present in the current GPS rows (for project reports modal) ─────
  const availableReportProjects = useMemo(() => {
    const set = new Set<string>();
    for (const row of allRows) {
      const ann = getAnnotation(row.key);
      if (ann.project) set.add(ann.project);
      for (const ex of extraSplits[row.key] ?? []) {
        if (ex.project) set.add(ex.project);
      }
    }
    return [...set].sort();
  }, [allRows, getAnnotation, extraSplits]);

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

  const setAnnotation = useCallback((key: string, field: keyof RowAnnotation, value: string, gpsMiles = 0) => {
    setAnnotations(prev => {
      const cur = { ...EMPTY_ANN, ...prev[key], [field]: value };
      if (gpsMiles > 0) {
        const alloc = cur.allocated !== "" ? (parseFloat(cur.allocated) || 0) : gpsMiles;
        if (field === "project" && value === "General") {
          cur.indirect = String(alloc);
          cur.personal = "";
          cur.direct   = "0";
        } else if (field === "indirect" || field === "personal") {
          const ind = parseFloat(field === "indirect" ? value : cur.indirect) || 0;
          const per = parseFloat(field === "personal" ? value : cur.personal) || 0;
          cur.direct = Math.max(0, alloc - ind - per).toFixed(1);
        } else if (field === "allocated") {
          const newAlloc = parseFloat(value) || 0;
          const ind = parseFloat(cur.indirect) || 0;
          const per = parseFloat(cur.personal) || 0;
          cur.direct = Math.max(0, newAlloc - ind - per).toFixed(1);
        }
      }
      return { ...prev, [key]: cur };
    });
  }, []);

  const setExtraSplit = useCallback((key: string, si: number, field: keyof RowAnnotation, value: string, gpsMiles = 0) => {
    setExtraSplits(prev => {
      const splits = [...(prev[key] ?? [])];
      if (si >= splits.length) return prev;
      const cur = { ...EMPTY_ANN, ...splits[si], [field]: value };
      if (gpsMiles > 0) {
        const alloc = parseFloat(cur.allocated) || 0;
        if (field === "project" && value === "General") {
          cur.indirect = String(alloc);
          cur.personal = "";
          cur.direct   = "0";
        } else if (field === "indirect" || field === "personal") {
          const ind = parseFloat(field === "indirect" ? value : cur.indirect) || 0;
          const per = parseFloat(field === "personal" ? value : cur.personal) || 0;
          cur.direct = Math.max(0, alloc - ind - per).toFixed(1);
        } else if (field === "allocated") {
          const newAlloc = parseFloat(value) || 0;
          const ind = parseFloat(cur.indirect) || 0;
          const per = parseFloat(cur.personal) || 0;
          cur.direct = Math.max(0, newAlloc - ind - per).toFixed(1);
        }
      }
      splits[si] = cur;
      return { ...prev, [key]: splits };
    });
  }, []);

  const handleSplitRow = useCallback((key: string, gpsMiles: number) => {
    const half = (gpsMiles / 2).toFixed(1);
    setAnnotations(prev => ({
      ...prev,
      [key]: { ...EMPTY_ANN, ...prev[key], allocated: half },
    }));
    setExtraSplits(prev => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { ...EMPTY_ANN, allocated: half }],
    }));
  }, []);

  const handleRemoveExtraSplit = useCallback((key: string, si: number, savedId?: number) => {
    if (savedId !== undefined) {
      deleteAnnotationM.mutate({ id: savedId });
    }
    setExtraSplits(prev => {
      const splits = (prev[key] ?? []).filter((_, idx) => idx !== si);
      if (splits.length === 0) {
        setAnnotations(prev2 => ({
          ...prev2,
          [key]: { ...EMPTY_ANN, ...prev2[key], allocated: "" },
        }));
        const rest = { ...prev };
        delete rest[key];
        return rest;
      }
      return { ...prev, [key]: splits };
    });
  }, [deleteAnnotationM]);

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
        setSessionPrefilled(new Set());
        setSessionMultiple(new Set());
        setExtraSplits({});
      }
      setViewMode("current");
      setSubmitted(false);
      setTimeout(() => setSubmitted(true), 0);
      qc.invalidateQueries({ queryKey: ["/api/periods"] });
      // Background: cache GPS data in DB so Reports can query it later
      syncGpsCacheMut.mutate({ data: { device_ids: selectedIds, from: dateFrom, to: dateTo } });
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
        const primaryAnn = getAnnotation(row.key);
        const extras     = extraSplits[row.key] ?? [];
        const allSplits  = [primaryAnn, ...extras];
        const savedExtraIds: number[] = [];

        for (let si = 0; si < allSplits.length; si++) {
          const ann    = allSplits[si];
          const isFirst = si === 0;
          const alloc   = ann.allocated !== "" ? (parseFloat(ann.allocated) || 0) : (isFirst ? row.gpsMiles : 0);
          const indirect = parseFloat(ann.indirect) || 0;
          const personal = parseFloat(ann.personal) || 0;
          const direct   = ann.direct !== "" ? parseFloat(ann.direct) : Math.max(0, alloc - indirect - personal);

          const result = await upsertAnnotationM.mutateAsync({
            data: {
              period_id:        activePeriodId,
              device_id:        row.deviceId,
              device_name:      row.deviceName,
              date:             row.date,
              split_index:      si,
              begin_odometer:   isFirst ? row.beginOdo : undefined,
              end_odometer:     isFirst ? row.endOdo   : undefined,
              gps_miles:        isFirst ? row.gpsMiles : undefined,
              indirect_miles:   indirect,
              personal_miles:   personal,
              direct_miles:     direct,
              project_number:   ann.project,
              team_leader_name: ann.leader,
            },
          });
          if (isFirst) {
            newSaved[row.key] = { id: result.id, is_exported: result.is_exported };
          } else {
            savedExtraIds.push(result.id);
          }
        }
        if (savedExtraIds.length > 0) {
          newSaved[row.key] = { ...newSaved[row.key], splitIds: savedExtraIds };
        }
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
    const rows = displayedRows;
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

  const handleOpenProjectReports = () => {
    setSelectedReportProjects(new Set(availableReportProjects));
    setShowProjectReports(true);
  };

  const handleCreateProjectReports = () => {
    const headers = [
      "DATE", "VEHICLE", "BEGIN ODOMETER", "END ODOMETER", "GPS MILES (DAY TOTAL)",
      "INDIRECT MILES", "PERSONAL / UNALLOWABLE", "JOB (DIRECT) MILES", "TEAM LEADER", "PROJECT NUMBER",
    ];

    for (const proj of selectedReportProjects) {
      const csvRows: string[][] = [];

      for (const row of allRows) {
        const ann    = getAnnotation(row.key);
        const extras = extraSplits[row.key] ?? [];
        const splits = [{ ...ann, isFirst: true }, ...extras.map(e => ({ ...e, isFirst: false }))];

        for (const split of splits) {
          if (split.project !== proj) continue;
          const indirect = parseFloat(split.indirect) || 0;
          const personal = parseFloat(split.personal) || 0;
          const alloc    = split.allocated !== "" ? (parseFloat(split.allocated) || 0)
                         : (split.isFirst ? row.gpsMiles : 0);
          const direct   = split.direct !== "" ? parseFloat(split.direct)
                         : Math.max(0, alloc - indirect - personal);
          csvRows.push([
            row.date,
            row.deviceName,
            row.beginOdo.toFixed(1),
            row.endOdo.toFixed(1),
            row.gpsMiles.toFixed(1),
            indirect > 0 ? indirect.toFixed(1) : "",
            personal > 0 ? personal.toFixed(1) : "",
            direct.toFixed(1),
            split.leader,
            proj,
          ]);
        }
      }

      if (!csvRows.length) continue;

      const csv  = [headers, ...csvRows].map(r => r.map(c => `"${String(c)}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `project-report-${proj.replace(/[^a-z0-9]/gi, "-")}-${dateFrom}-to-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setShowProjectReports(false);
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
    const ann    = getAnnotation(r.key);
    const extras = extraSplits[r.key] ?? [];
    const ind    = parseFloat(ann.indirect) || 0;
    const per    = parseFloat(ann.personal) || 0;
    const dir    = ann.direct !== "" ? parseFloat(ann.direct)
                 : (extras.length > 0 ? Math.max(0, (parseFloat(ann.allocated) || 0) - ind - per)
                 : r.gpsMiles);
    let total = ind + per + dir;
    for (const ex of extras) {
      const sAlloc = parseFloat(ex.allocated) || 0;
      const sInd   = parseFloat(ex.indirect) || 0;
      const sPer   = parseFloat(ex.personal) || 0;
      const sDir   = ex.direct !== "" ? parseFloat(ex.direct) : Math.max(0, sAlloc - sInd - sPer);
      total += sInd + sPer + sDir;
    }
    return sum + total;
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
        <th className="w-10 px-2" />
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
    setAnn: (key: string, field: keyof RowAnnotation, val: string, miles?: number) => void,
    savedInfo?: { id: number; is_exported: boolean; splitIds?: number[] },
    readonly = false,
  ) {
    const extras     = extraSplits[row.key] ?? [];
    const isSplit    = extras.length > 0;
    const indirect   = parseFloat(ann.indirect) || 0;
    const personal   = parseFloat(ann.personal) || 0;
    const primaryAlloc = isSplit ? (parseFloat(ann.allocated) || 0) : row.gpsMiles;
    const direct     = ann.direct !== ""
      ? parseFloat(ann.direct)
      : (isSplit ? Math.max(0, primaryAlloc - indirect - personal) : row.gpsMiles);
    const total      = isSplit ? primaryAlloc : (indirect + personal + direct);

    const extraAllocSum  = isSplit ? extras.reduce((s, ex) => s + (parseFloat(ex.allocated) || 0), 0) : 0;
    const splitMismatch  = isSplit && Math.abs(primaryAlloc + extraAllocSum - row.gpsMiles) > 0.05;
    const rowBg = cn("border-b border-white/5 hover:bg-white/[0.03] transition-colors", i % 2 !== 0 && "bg-white/[0.015]");

    return (
      <Fragment key={row.key}>
        {/* ── Primary row ── */}
        <tr className={rowBg}>
          {/* Status */}
          <td className="px-2 py-1.5 w-10">
            <div className="flex items-center gap-0.5">
              {savedInfo ? (
                <span aria-label={savedInfo.is_exported ? "Saved & exported" : "Saved"}>
                  <CheckCircle2 className={cn("h-3.5 w-3.5", savedInfo.is_exported ? "text-white/20" : "text-emerald-400/70")} />
                </span>
              ) : sessionPrefilled.has(row.key) ? (
                <span title="Pre-filled from driver session">
                  <User className="h-3.5 w-3.5 text-sky-400/70" />
                </span>
              ) : null}
              {sessionMultiple.has(row.key) && (
                <span title="Multiple driver sessions this day">
                  <AlertTriangle className="h-3 w-3 text-amber-400/70" />
                </span>
              )}
              {!readonly && (
                <button onClick={() => handleSplitRow(row.key, row.gpsMiles)}
                  title="Split this day's mileage across multiple projects"
                  className="text-white/20 hover:text-amber-400 transition-colors ml-0.5">
                  <Scissors className="h-3 w-3" />
                </button>
              )}
            </div>
          </td>
          <td className="px-3 py-1.5 font-mono text-xs text-white/70 whitespace-nowrap">{row.date}</td>
          <td className="px-3 py-1.5 text-xs text-amber-400/80 whitespace-nowrap">{row.deviceName}</td>
          <td className="px-3 py-1.5 font-mono text-xs text-white/40 text-right">{row.beginOdo.toFixed(1)}</td>
          <td className="px-3 py-1.5 font-mono text-xs text-white/40 text-right">{row.endOdo.toFixed(1)}</td>
          <td className="px-1.5 py-1">
            {readonly
              ? <span className="block px-2 text-xs font-mono text-white/60">{indirect > 0 ? indirect.toFixed(1) : "—"}</span>
              : <Input type="number" min="0" step="0.1" placeholder="—" value={ann.indirect}
                  onChange={e => setAnn(row.key, "indirect", e.target.value, row.gpsMiles)}
                  className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
          </td>
          <td className="px-1.5 py-1">
            {readonly
              ? <span className="block px-2 text-xs font-mono text-white/60">{personal > 0 ? personal.toFixed(1) : "—"}</span>
              : <Input type="number" min="0" step="0.1" placeholder="—" value={ann.personal}
                  onChange={e => setAnn(row.key, "personal", e.target.value, row.gpsMiles)}
                  className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
          </td>
          <td className="px-1.5 py-1">
            {readonly
              ? <span className="block px-2 text-xs font-mono text-white/60">{direct.toFixed(1)}</span>
              : <Input type="number" min="0" step="0.1"
                  placeholder={isSplit ? Math.max(0, primaryAlloc - indirect - personal).toFixed(1) : row.gpsMiles.toFixed(1)}
                  value={ann.direct}
                  onChange={e => setAnn(row.key, "direct", e.target.value, row.gpsMiles)}
                  className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/40 px-2" />}
          </td>
          <td className="px-1.5 py-1 min-w-[160px]">
            <div className={cn("h-7 rounded border transition-colors",
              readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
              <Combobox value={ann.project} onChange={v => setAnn(row.key, "project", v, row.gpsMiles)}
                options={projectOptions} placeholder="Project…" disabled={readonly}
                allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateProject} />
            </div>
          </td>
          {/* TOTAL / ALLOCATED */}
          <td className="px-3 py-1.5 font-mono text-xs font-bold text-white text-right whitespace-nowrap">
            {isSplit && !readonly
              ? <Input type="number" min="0" step="0.1" value={ann.allocated}
                  onChange={e => setAnn(row.key, "allocated", e.target.value, row.gpsMiles)}
                  placeholder={row.gpsMiles.toFixed(1)}
                  title="Miles allocated to this project from today's GPS total"
                  className={cn("h-7 w-[78px] text-xs font-mono border focus:bg-white/10 placeholder:text-white/30 px-2 text-right",
                    splitMismatch ? "border-red-500/50 bg-red-500/5" : "bg-white/5 border-white/10 focus:border-amber-500/50")} />
              : total.toFixed(1)
            }
          </td>
          <td className="px-1.5 py-1 min-w-[150px]">
            <div className={cn("h-7 rounded border transition-colors",
              readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
              <Combobox value={ann.leader} onChange={v => setAnn(row.key, "leader", v)}
                options={leaderOptions} placeholder="Leader…" disabled={readonly}
                allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateLeader} />
            </div>
          </td>
        </tr>

        {/* ── Extra split rows ── */}
        {extras.map((split, si) => {
          const sAlloc = parseFloat(split.allocated) || 0;
          const sInd   = parseFloat(split.indirect) || 0;
          const sPer   = parseFloat(split.personal) || 0;
          const sDir   = split.direct !== "" ? parseFloat(split.direct) : Math.max(0, sAlloc - sInd - sPer);
          return (
            <tr key={`${row.key}_s${si + 1}`} className="border-b border-white/5 bg-sky-950/20">
              <td className="px-2 py-1.5 w-10">
                {!readonly && (
                  <button onClick={() => handleRemoveExtraSplit(row.key, si, savedInfo?.splitIds?.[si])}
                    title="Remove this split"
                    className="text-white/20 hover:text-red-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs text-white/25">↳ {si + 2}</td>
              <td /><td /><td />
              <td className="px-1.5 py-1">
                {readonly
                  ? <span className="block px-2 text-xs font-mono text-white/60">{sInd > 0 ? sInd.toFixed(1) : "—"}</span>
                  : <Input type="number" min="0" step="0.1" placeholder="—" value={split.indirect}
                      onChange={e => setExtraSplit(row.key, si, "indirect", e.target.value, row.gpsMiles)}
                      className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
              </td>
              <td className="px-1.5 py-1">
                {readonly
                  ? <span className="block px-2 text-xs font-mono text-white/60">{sPer > 0 ? sPer.toFixed(1) : "—"}</span>
                  : <Input type="number" min="0" step="0.1" placeholder="—" value={split.personal}
                      onChange={e => setExtraSplit(row.key, si, "personal", e.target.value, row.gpsMiles)}
                      className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2" />}
              </td>
              <td className="px-1.5 py-1">
                <span className="block px-2 text-xs font-mono text-white/60">{sDir.toFixed(1)}</span>
              </td>
              <td className="px-1.5 py-1 min-w-[160px]">
                <div className={cn("h-7 rounded border transition-colors",
                  readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
                  <Combobox value={split.project} onChange={v => setExtraSplit(row.key, si, "project", v, row.gpsMiles)}
                    options={projectOptions} placeholder="Project…" disabled={readonly}
                    allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateProject} />
                </div>
              </td>
              <td className="px-3 py-1.5 text-right">
                {readonly
                  ? <span className="font-mono text-xs font-bold text-white/60">{sAlloc.toFixed(1)}</span>
                  : <Input type="number" min="0" step="0.1" value={split.allocated}
                      onChange={e => setExtraSplit(row.key, si, "allocated", e.target.value, row.gpsMiles)}
                      placeholder="0"
                      title="Miles allocated to this project from today's GPS total"
                      className={cn("h-7 w-[78px] text-xs font-mono border focus:bg-white/10 placeholder:text-white/30 px-2 text-right",
                        splitMismatch ? "border-red-500/50 bg-red-500/5" : "bg-white/5 border-white/10 focus:border-amber-500/50")} />}
              </td>
              <td className="px-1.5 py-1 min-w-[150px]">
                <div className={cn("h-7 rounded border transition-colors",
                  readonly ? "border-white/5 bg-transparent" : "border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10")}>
                  <Combobox value={split.leader} onChange={v => setExtraSplit(row.key, si, "leader", v)}
                    options={leaderOptions} placeholder="Leader…" disabled={readonly}
                    allowNew={!readonly} onCreateNew={readonly ? undefined : handleCreateLeader} />
                </div>
              </td>
            </tr>
          );
        })}

        {/* ── GPS total indicator when split (highlights mismatch) ── */}
        {isSplit && (
          <tr className="border-b border-white/5">
            <td colSpan={9} />
            <td className="px-3 py-0.5 text-right">
              <span className={cn("text-[10px] font-mono", splitMismatch ? "text-red-400/80" : "text-white/20")}>
                GPS {row.gpsMiles.toFixed(1)} mi total{splitMismatch && " ⚠"}
              </span>
            </td>
            <td />
          </tr>
        )}
      </Fragment>
    );
  }

  // ── Footer renderer ─────────────────────────────────────────────────────────
  function renderFooter(rows: GpsRow[], getAnn: (key: string) => RowAnnotation) {
    let totI = 0, totP = 0, totD = 0;
    for (const r of rows) {
      const ann    = getAnn(r.key);
      const exs    = extraSplits[r.key] ?? [];
      const ind    = parseFloat(ann.indirect) || 0;
      const per    = parseFloat(ann.personal) || 0;
      const dir    = ann.direct !== "" ? parseFloat(ann.direct)
                   : (exs.length > 0 ? Math.max(0, (parseFloat(ann.allocated) || 0) - ind - per)
                   : r.gpsMiles);
      totI += ind; totP += per; totD += dir;
      for (const ex of exs) {
        const sAlloc = parseFloat(ex.allocated) || 0;
        const sInd   = parseFloat(ex.indirect) || 0;
        const sPer   = parseFloat(ex.personal) || 0;
        const sDir   = ex.direct !== "" ? parseFloat(ex.direct) : Math.max(0, sAlloc - sInd - sPer);
        totI += sInd; totP += sPer; totD += sDir;
      }
    }
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
            <img src="/logo.png" alt="FleetLog" className="h-8 w-auto" />
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-tight leading-none">FleetLog</div>
              <div className="text-[10px] text-white/30 font-mono mt-0.5">Mileage Log</div>
            </div>
          </div>

          {/* Period badge */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {periodBadge()}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">

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

            {viewMode === "current" && availableReportProjects.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleOpenProjectReports}
                className="h-8 text-xs text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 gap-1.5 border border-amber-500/20">
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Project Reports</span>
              </Button>
            )}

            <div className="h-4 w-px bg-white/10 mx-0.5" />

            <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}
              className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10 gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Accountability alert banner ──────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="print:hidden border-b border-amber-500/20 bg-amber-500/5">
          <div className="container mx-auto max-w-7xl px-4">
            <button
              onClick={() => setAlertsBannerExpanded(p => !p)}
              className="w-full flex items-center gap-2 py-2.5 text-left"
            >
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-300">
                {alerts.length} unaccounted truck movement{alerts.length !== 1 ? "s" : ""} detected
              </span>
              <span className="text-xs text-white/30 ml-1 hidden sm:inline">
                — trucks moved yesterday with no driver or project on record
              </span>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await checkNowMut.mutateAsync();
                  qc.invalidateQueries({ queryKey: getListAlertsQueryKey() });
                }}
                disabled={checkNowMut.isPending}
                className="ml-auto mr-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Re-run the accountability check now"
              >
                {checkNowMut.isPending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Clock className="h-3 w-3" />}
                Run Check Now
              </button>
              <ChevronDown className={`h-3.5 w-3.5 text-white/30 transition-transform ${alertsBannerExpanded ? "rotate-180" : ""}`} />
            </button>

            {alertsBannerExpanded && (
              <div className="pb-3 space-y-1.5">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 bg-amber-500/8 rounded-md px-3 py-2 border border-amber-500/15">
                    <Truck className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                    <span className="text-sm font-medium text-white/80">{alert.device_name}</span>
                    <span className="text-xs text-white/30">·</span>
                    <span className="text-xs text-amber-400/80 font-mono">{alert.alert_date}</span>
                    <span className="text-xs text-white/30">·</span>
                    {alert.issue === "no_session" ? (
                      <span className="text-xs text-red-300/80 flex items-center gap-1">
                        <User className="h-3 w-3" /> No driver logged
                      </span>
                    ) : (
                      <span className="text-xs text-orange-300/80 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> No project assigned
                      </span>
                    )}
                    <button
                      onClick={async () => {
                        await dismissAlertMut.mutateAsync({ id: alert.id });
                        qc.invalidateQueries({ queryKey: getListAlertsQueryKey() });
                      }}
                      disabled={dismissAlertMut.isPending}
                      className="ml-auto text-white/20 hover:text-white/60 transition-colors disabled:opacity-30"
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print header */}
      <div className="hidden print:block text-center py-4 border-b border-black mb-4">
        <h1 className="text-xl font-bold">Fleet Mileage Log</h1>
        <p className="text-sm text-gray-600">{dateFrom} — {dateTo} · Generated {format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      <main className="container mx-auto max-w-7xl px-4 mt-5">

        {/* ── Current log view ─────────────────────────────────────────────── */}
        <>
            {/* ── Current log controls ──────────────────────────────────────── */}
            <div className="flex flex-wrap items-end gap-3 mb-5 print:hidden">
              {/* Truck selector */}
              <div className="space-y-1.5 w-full sm:w-auto">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">Vehicles</Label>
                <Popover open={truckOpen} onOpenChange={setTruckOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" disabled={devicesLoading}
                      className="h-9 w-full sm:w-auto sm:min-w-[180px] justify-between bg-white/5 border-white/10 hover:bg-white/10 text-sm font-normal">
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
              <div className="space-y-1.5 flex-1 min-w-[130px] sm:flex-none">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">From</Label>
                <Input type="date" value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setSubmitted(false); }}
                  className="h-9 w-full sm:w-[150px] bg-white/5 border-white/10 text-sm" />
              </div>
              <div className="space-y-1.5 flex-1 min-w-[130px] sm:flex-none">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">To</Label>
                <Input type="date" value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setSubmitted(false); }}
                  className="h-9 w-full sm:w-[150px] bg-white/5 border-white/10 text-sm" />
              </div>

              {/* Project filter */}
              <div className="space-y-1.5 flex-1 min-w-[130px] sm:flex-none">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">Project</Label>
                <Popover open={projectFilterOpen} onOpenChange={setProjectFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline"
                      className="h-9 w-full sm:w-auto sm:min-w-[150px] justify-between bg-white/5 border-white/10 hover:bg-white/10 text-sm font-normal">
                      <span className={cn(!projectFilter && "text-white/40")}>{projectFilter || "All projects"}</span>
                      <div className="flex items-center gap-1">
                        {projectFilter && (
                          <X className="h-3 w-3 opacity-50 hover:opacity-100"
                            onClick={e => { e.stopPropagation(); setProjectFilter(""); }} />
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-1" />
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search…" className="h-8" />
                      <CommandList>
                        <CommandEmpty>No projects found</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__all_projects__" onSelect={() => { setProjectFilter(""); setProjectFilterOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", !projectFilter ? "opacity-100" : "opacity-0")} />
                            All Projects
                          </CommandItem>
                          {projectOptions.map(p => (
                            <CommandItem key={p} value={p}
                              onSelect={() => { setProjectFilter(p === projectFilter ? "" : p); setProjectFilterOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", projectFilter === p ? "opacity-100" : "opacity-0")} />
                              {p}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Leader filter */}
              <div className="space-y-1.5 flex-1 min-w-[130px] sm:flex-none">
                <Label className="text-[10px] text-white/40 uppercase tracking-wider">Team Leader</Label>
                <Popover open={leaderFilterOpen} onOpenChange={setLeaderFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline"
                      className="h-9 w-full sm:w-auto sm:min-w-[150px] justify-between bg-white/5 border-white/10 hover:bg-white/10 text-sm font-normal">
                      <span className={cn(!leaderFilter && "text-white/40")}>{leaderFilter || "All leaders"}</span>
                      <div className="flex items-center gap-1">
                        {leaderFilter && (
                          <X className="h-3 w-3 opacity-50 hover:opacity-100"
                            onClick={e => { e.stopPropagation(); setLeaderFilter(""); }} />
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-1" />
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search…" className="h-8" />
                      <CommandList>
                        <CommandEmpty>No leaders found</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="__all_leaders__" onSelect={() => { setLeaderFilter(""); setLeaderFilterOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", !leaderFilter ? "opacity-100" : "opacity-0")} />
                            All Leaders
                          </CommandItem>
                          {leaderOptions.map(l => (
                            <CommandItem key={l} value={l}
                              onSelect={() => { setLeaderFilter(l === leaderFilter ? "" : l); setLeaderFilterOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", leaderFilter === l ? "opacity-100" : "opacity-0")} />
                              {l}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <Button onClick={handleGenerate}
                disabled={selectedIds.length === 0 || !dateFrom || !dateTo || isLoadingGPS || isGenerating}
                className="h-9 w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm">
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


            {/* GPS table (desktop only) */}
            <div className="hidden md:block rounded-lg border border-white/10 overflow-hidden">
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

            {/* Read-only stacked cards (mobile, below md) */}
            <div className="md:hidden">
              {!submitted ? (
                <div className="rounded-lg border border-white/10 py-16 text-center">
                  <Truck className="h-8 w-8 mx-auto mb-3 text-white/10" />
                  <p className="text-white/25 text-sm px-6">Select trucks and a date range, then tap Generate Log.</p>
                </div>
              ) : isLoadingGPS ? (
                <div className="rounded-lg border border-white/10 py-16 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-400/50" />
                  <p className="text-white/30 text-sm">Pulling GPS data…</p>
                </div>
              ) : displayedRows.length === 0 ? (
                <div className="rounded-lg border border-white/10 py-16 text-center">
                  <p className="text-white/30 text-sm">No driving days found for the selected period.</p>
                </div>
              ) : (
                <>
                  <p className="text-[11px] text-white/40 mb-2.5 flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    Editing is available on desktop.
                  </p>
                  <div className="space-y-2.5">
                    {displayedRows.map(row => {
                      const ann      = getAnnotation(row.key);
                      const savedInfo = savedAnnotationMap[row.key];
                      const indirect = parseFloat(ann.indirect) || 0;
                      const personal = parseFloat(ann.personal) || 0;
                      const direct   = ann.direct !== "" ? parseFloat(ann.direct) : row.gpsMiles;
                      return (
                        <div key={row.key} className="rounded-xl border border-white/10 bg-[#161b22] p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium text-amber-400/90 truncate">{row.deviceName}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {savedInfo && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                                  savedInfo.is_exported
                                    ? "text-white/40 border-white/15"
                                    : "text-emerald-400/80 border-emerald-500/25 bg-emerald-500/10",
                                )}>
                                  {savedInfo.is_exported ? "Exported" : "Saved"}
                                </span>
                              )}
                              <span className="text-xs font-mono text-white/40">{row.date}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <div>
                              <span className="text-white/40">GPS </span>
                              <span className="font-mono text-white/70">{row.gpsMiles.toFixed(1)}</span>
                            </div>
                            <div>
                              <span className="text-white/40">Indirect </span>
                              <span className="font-mono text-white/70">{indirect > 0 ? indirect.toFixed(1) : "—"}</span>
                            </div>
                            <div>
                              <span className="text-white/40">Personal </span>
                              <span className="font-mono text-white/70">{personal > 0 ? personal.toFixed(1) : "—"}</span>
                            </div>
                            <div>
                              <span className="text-white/40">Direct </span>
                              <span className="font-mono text-white/70">{direct.toFixed(1)}</span>
                            </div>
                          </div>
                          {(ann.project || ann.leader) && (
                            <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <div className="truncate">
                                <span className="text-white/40">Project </span>
                                <span className="text-white/80">{ann.project || "—"}</span>
                              </div>
                              <div className="truncate">
                                <span className="text-white/40">Leader </span>
                                <span className="text-white/80">{ann.leader || "—"}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
      </main>

      {/* Project Reports modal */}
      {showProjectReports && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowProjectReports(false); }}>
          <div className="bg-[#161b22] border border-white/10 rounded-xl shadow-2xl w-[440px] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 shrink-0">
              <FileText className="h-5 w-5 text-amber-400" />
              <div className="flex-1">
                <h2 className="text-sm font-semibold">Project Reports</h2>
                <p className="text-xs text-white/40 mt-0.5">{dateFrom} — {dateTo}</p>
              </div>
              <button onClick={() => setShowProjectReports(false)} className="text-white/30 hover:text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/40 uppercase tracking-wider">Select projects to export</p>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedReportProjects(new Set(availableReportProjects))}
                    className="text-xs text-amber-400/70 hover:text-amber-300">All</button>
                  <span className="text-white/20">·</span>
                  <button onClick={() => setSelectedReportProjects(new Set())}
                    className="text-xs text-white/40 hover:text-white/60">None</button>
                </div>
              </div>

              {availableReportProjects.map(proj => {
                const checked = selectedReportProjects.has(proj);
                const rowCount = allRows.filter(r => {
                  const ann = getAnnotation(r.key);
                  if (ann.project === proj) return true;
                  return (extraSplits[r.key] ?? []).some(e => e.project === proj);
                }).length;
                return (
                  <button key={proj}
                    onClick={() => setSelectedReportProjects(prev => {
                      const next = new Set(prev);
                      if (next.has(proj)) next.delete(proj); else next.add(proj);
                      return next;
                    })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                      checked
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-white/3 border-white/8 hover:bg-white/6"
                    }`}>
                    <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? "bg-amber-500 border-amber-500" : "border-white/30"
                    }`}>
                      {checked && <Check className="h-2.5 w-2.5 text-black" />}
                    </div>
                    <span className={`flex-1 text-sm font-medium ${checked ? "text-white" : "text-white/60"}`}>
                      {proj}
                    </span>
                    <span className="text-xs text-white/30 font-mono">{rowCount} day{rowCount !== 1 ? "s" : ""}</span>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 shrink-0">
              <p className="text-xs text-white/30 mb-3">
                One CSV file per project — each row is one truck day with mileage for that project.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleCreateProjectReports}
                  disabled={selectedReportProjects.size === 0}
                  className="flex-1 h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm gap-1.5 disabled:opacity-40">
                  <Download className="h-4 w-4" />
                  Create {selectedReportProjects.size > 0 ? `${selectedReportProjects.size} ` : ""}Report{selectedReportProjects.size !== 1 ? "s" : ""}
                </Button>
                <Button variant="ghost" onClick={() => setShowProjectReports(false)}
                  className="h-9 text-sm text-white/50 hover:text-white hover:bg-white/10">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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
