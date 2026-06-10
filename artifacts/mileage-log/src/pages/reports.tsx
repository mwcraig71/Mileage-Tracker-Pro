import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import {
  BarChart2, Download, Printer, ChevronDown, Check, Filter, ArrowLeft, X,
  Loader2, Pencil, Scissors, Plus, Save,
} from "lucide-react";
import { Link } from "wouter";
import {
  useGetReports,
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useUpdateAnnotation,
  useUpsertAnnotation,
  useDeleteAnnotation,
  getGetReportsQueryKey,
} from "@workspace/api-client-react";
import type { ReportRow } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────────────────── */
interface EditRow {
  project: string;
  leader: string;
  indirect: string;
  personal: string;
  direct: string;
}

const blankEdit = (): EditRow => ({
  project: "", leader: "", indirect: "", personal: "", direct: "",
});

const rowKey  = (row: ReportRow) => `${row.device_id}_${row.date}_${row.split_index}`;
const groupKey = (row: ReportRow) => `${row.device_id}_${row.date}`;

/* ── Constants ──────────────────────────────────────────────────────── */
const now        = new Date();
const DEFAULT_FROM = format(startOfMonth(subMonths(now, 2)), "yyyy-MM-dd");
const DEFAULT_TO   = format(endOfMonth(subMonths(now, 1)),   "yyyy-MM-dd");

/* ── Tiny inline number input ───────────────────────────────────────── */
function MilesInput({
  value, onChange, color,
}: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <input
      type="number"
      min={0}
      step={0.1}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        "w-20 h-7 rounded px-1.5 text-right text-xs font-mono bg-white/5 border border-white/10",
        "focus:outline-none focus:border-white/30",
        color,
      )}
    />
  );
}

/* ── Tiny inline text input ─────────────────────────────────────────── */
function TextInput({
  value, onChange, list, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  list?: string; placeholder?: string;
}) {
  return (
    <input
      type="text"
      list={list}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-28 h-7 rounded px-1.5 text-xs bg-white/5 border border-white/10 focus:outline-none focus:border-white/30 text-white"
    />
  );
}

/* ════════════════════════════════════════════════════════════════════ */
export default function Reports() {

  /* Filter state */
  const [dateFrom, setDateFrom]       = useState(DEFAULT_FROM);
  const [dateTo, setDateTo]           = useState(DEFAULT_TO);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [leaderFilter, setLeaderFilter]   = useState("");
  const [submitted, setSubmitted]     = useState(false);
  const [deviceOpen, setDeviceOpen]   = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [leaderOpen, setLeaderOpen]   = useState(false);

  /* Edit / split state */
  const [editMode,      setEditMode]      = useState<Set<string>>(new Set());
  const [localEdits,    setLocalEdits]    = useState<Record<string, EditRow>>({});
  const [pendingSplits, setPendingSplits] = useState<Record<string, EditRow[]>>({});
  const [savingKeys,    setSavingKeys]    = useState<Set<string>>(new Set());
  const [deletingIds,   setDeletingIds]   = useState<Set<number>>(new Set());

  /* Data hooks */
  const { data: devices     = [] } = useGetGpsDevices();
  const { data: projects    = [] } = useListProjects();
  const { data: teamLeaders = [] } = useListTeamLeaders();

  const updateAnnotationM = useUpdateAnnotation();
  const upsertAnnotationM = useUpsertAnnotation();
  const deleteAnnotationM = useDeleteAnnotation();

  const params = {
    from: dateFrom,
    to:   dateTo,
    ...(selectedIds.length > 0 ? { "device_ids[]": selectedIds } : {}),
    ...(projectFilter ? { project: projectFilter } : {}),
    ...(leaderFilter  ? { leader:  leaderFilter  } : {}),
  };

  const { data: rows = [], isFetching, refetch } = useGetReports(params, {
    query: {
      enabled: submitted && !!dateFrom && !!dateTo,
      queryKey: getGetReportsQueryKey(params),
    },
  });

  /* ── Build display list interleaving rows + pending splits ────────── */
  type DisplayItem =
    | { kind: "row";     row: ReportRow }
    | { kind: "pending"; parentRow: ReportRow; idx: number };

  const displayList = useMemo<DisplayItem[]>(() => {
    if (!rows.length) return [];
    const lastIdxForGroup: Record<string, number> = {};
    rows.forEach((r, i) => { lastIdxForGroup[groupKey(r)] = i; });

    const items: DisplayItem[] = [];
    rows.forEach((row, i) => {
      items.push({ kind: "row", row });
      if (lastIdxForGroup[groupKey(row)] === i) {
        const gk = groupKey(row);
        (pendingSplits[gk] ?? []).forEach((_, idx) =>
          items.push({ kind: "pending", parentRow: row, idx }),
        );
      }
    });
    return items;
  }, [rows, pendingSplits]);

  /* ── Totals ──────────────────────────────────────────────────────── */
  const totals = useMemo(() => ({
    gps:      rows.reduce((s, r) => s + (r.gps_miles ?? 0), 0),
    indirect: rows.reduce((s, r) => s + r.indirect_miles,   0),
    personal: rows.reduce((s, r) => s + r.personal_miles,   0),
    direct:   rows.reduce((s, r) => s + r.direct_miles,     0),
  }), [rows]);

  /* ── Edit helpers ─────────────────────────────────────────────────── */
  const startEdit = (row: ReportRow) => {
    const key = rowKey(row);
    setEditMode(prev => new Set([...prev, key]));
    setLocalEdits(prev => ({
      ...prev,
      [key]: {
        project:  row.project_number   ?? "",
        leader:   row.team_leader_name ?? "",
        indirect: row.indirect_miles > 0 ? String(row.indirect_miles) : "",
        personal: row.personal_miles > 0 ? String(row.personal_miles) : "",
        direct:   row.direct_miles   > 0 ? String(row.direct_miles)   : "",
      },
    }));
  };

  const cancelEdit = (key: string) => {
    setEditMode(prev => { const s = new Set(prev); s.delete(key); return s; });
    setLocalEdits(prev => { const c = { ...prev }; delete c[key]; return c; });
  };

  const patchEdit = (key: string, patch: Partial<EditRow>) =>
    setLocalEdits(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveEdit = async (row: ReportRow) => {
    const key  = rowKey(row);
    const edit = localEdits[key];
    if (!edit || !row.annotation_id) return;
    setSavingKeys(prev => new Set([...prev, key]));
    try {
      await updateAnnotationM.mutateAsync({
        id: row.annotation_id,
        data: {
          project_number:   edit.project,
          team_leader_name: edit.leader,
          indirect_miles:   parseFloat(edit.indirect) || 0,
          personal_miles:   parseFloat(edit.personal) || 0,
          direct_miles:     parseFloat(edit.direct)   || 0,
        },
      });
      cancelEdit(key);
      await refetch();
    } finally {
      setSavingKeys(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  /* ── Delete split ────────────────────────────────────────────────── */
  const deleteSplit = async (row: ReportRow) => {
    if (!row.annotation_id) return;
    setDeletingIds(prev => new Set([...prev, row.annotation_id!]));
    try {
      await deleteAnnotationM.mutateAsync({ id: row.annotation_id });
      await refetch();
    } finally {
      setDeletingIds(prev => { const s = new Set(prev); s.delete(row.annotation_id!); return s; });
    }
  };

  /* ── Pending split helpers ───────────────────────────────────────── */
  const addPendingSplit = (row: ReportRow) => {
    const gk = groupKey(row);
    setPendingSplits(prev => ({ ...prev, [gk]: [...(prev[gk] ?? []), blankEdit()] }));
  };

  const patchPending = (gk: string, idx: number, patch: Partial<EditRow>) =>
    setPendingSplits(prev => {
      const arr = [...(prev[gk] ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...prev, [gk]: arr };
    });

  const cancelPending = (gk: string, idx: number) =>
    setPendingSplits(prev => {
      const arr = [...(prev[gk] ?? [])];
      arr.splice(idx, 1);
      return { ...prev, [gk]: arr };
    });

  const savePending = async (parentRow: ReportRow, idx: number) => {
    const gk   = groupKey(parentRow);
    const edit = (pendingSplits[gk] ?? [])[idx];
    if (!edit || !parentRow.period_id) return;

    const existingForGroup = rows.filter(
      r => r.device_id === parentRow.device_id && r.date === parentRow.date,
    );
    const maxIdx     = Math.max(...existingForGroup.map(r => r.split_index));
    const newSplitIdx = maxIdx + 1 + idx;

    const pendingKey = `${gk}_pending_${idx}`;
    setSavingKeys(prev => new Set([...prev, pendingKey]));
    try {
      await upsertAnnotationM.mutateAsync({
        data: {
          period_id:        parentRow.period_id,
          device_id:        parentRow.device_id,
          device_name:      parentRow.device_name,
          date:             parentRow.date,
          split_index:      newSplitIdx,
          begin_odometer:   null,
          end_odometer:     null,
          gps_miles:        null,
          indirect_miles:   parseFloat(edit.indirect) || 0,
          personal_miles:   parseFloat(edit.personal) || 0,
          direct_miles:     parseFloat(edit.direct)   || 0,
          project_number:   edit.project,
          team_leader_name: edit.leader,
        },
      });
      cancelPending(gk, idx);
      await refetch();
    } finally {
      setSavingKeys(prev => { const s = new Set(prev); s.delete(pendingKey); return s; });
    }
  };

  /* ── CSV export ───────────────────────────────────────────────────── */
  const handleExportCSV = () => {
    const headers = ["Date", "Vehicle", "GPS Miles", "Indirect", "Personal", "Direct", "Project", "Leader"];
    const csvRows = rows.map(r => [
      r.split_index > 0 ? "" : r.date,
      r.split_index > 0 ? `  (split ${r.split_index})` : r.device_name,
      r.split_index > 0 ? "" : (r.gps_miles?.toFixed(1) ?? ""),
      r.indirect_miles > 0 ? r.indirect_miles.toFixed(1) : "",
      r.personal_miles > 0 ? r.personal_miles.toFixed(1) : "",
      r.direct_miles   > 0 ? r.direct_miles.toFixed(1)   : "",
      r.project_number,
      r.team_leader_name,
    ]);
    const csv  = [headers, ...csvRows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `fleet-report-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleDevice = (id: string) =>
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );

  /* ── Datalist ids ────────────────────────────────────────────────── */
  const DL_PROJ   = "rpt-projects-dl";
  const DL_LEADER = "rpt-leaders-dl";

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">

      {/* Hidden datalists for autocomplete */}
      <datalist id={DL_PROJ}>
        {projects.map(p => <option key={p.id} value={p.project_number} />)}
      </datalist>
      <datalist id={DL_LEADER}>
        {teamLeaders.map(l => <option key={l.id} value={l.name} />)}
      </datalist>

      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1117]/90 backdrop-blur sticky top-0 z-10 print:hidden">
        <div className="container mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <BarChart2 className="h-5 w-5 text-amber-400" />
            <span className="font-bold text-base tracking-tight">FleetLog</span>
            <span className="text-xs text-white/30 font-mono ml-1 hidden sm:block">Reports</span>
          </div>

          <div className="flex-1" />

          <Link to="/"
            className="flex items-center gap-1 text-xs text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mileage Log</span>
          </Link>

          <Button variant="ghost" size="sm" onClick={() => window.print()}
            className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10">
            <Printer className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="sm" onClick={handleExportCSV} disabled={!rows.length}
            className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/10 gap-1.5 disabled:opacity-40">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </header>

      {/* Print header */}
      <div className="hidden print:block text-center py-4 border-b border-black mb-4">
        <h1 className="text-xl font-bold">Fleet Mileage Report</h1>
        <p className="text-sm">{dateFrom} – {dateTo}</p>
        {selectedIds.length > 0 && (
          <p className="text-xs mt-1">
            Vehicles: {selectedIds.map(id => devices.find(d => d.device_id === id)?.display_name ?? id).join(", ")}
          </p>
        )}
        {projectFilter && <p className="text-xs">Project: {projectFilter}</p>}
        {leaderFilter  && <p className="text-xs">Leader: {leaderFilter}</p>}
      </div>

      {/* Filters panel */}
      <div className="container mx-auto max-w-7xl px-4 py-4 print:hidden">
        <div className="bg-[#161b22] border border-white/10 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* Date From */}
            <div className="space-y-1">
              <Label className="text-xs text-white/50">From</Label>
              <Input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setSubmitted(false); }}
                className="h-8 text-sm bg-[#0d1117] border-white/10" />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <Label className="text-xs text-white/50">To</Label>
              <Input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setSubmitted(false); }}
                className="h-8 text-sm bg-[#0d1117] border-white/10" />
            </div>

            {/* Vehicle */}
            <div className="space-y-1">
              <Label className="text-xs text-white/50">Vehicle</Label>
              <Popover open={deviceOpen} onOpenChange={setDeviceOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="w-full h-8 text-xs justify-between bg-[#0d1117] border-white/10 text-left font-normal">
                    <span className="truncate">
                      {selectedIds.length === 0 ? "All vehicles" : `${selectedIds.length} selected`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search…" className="h-8" />
                    <CommandList>
                      <CommandEmpty>No vehicles found</CommandEmpty>
                      <CommandGroup>
                        {devices.map(d => (
                          <CommandItem key={d.device_id} value={d.display_name}
                            onSelect={() => { toggleDevice(d.device_id); setSubmitted(false); }}>
                            <Check className={cn("mr-2 h-4 w-4",
                              selectedIds.includes(d.device_id) ? "opacity-100" : "opacity-0")} />
                            {d.display_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Project */}
            <div className="space-y-1">
              <Label className="text-xs text-white/50">Project</Label>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="w-full h-8 text-xs justify-between bg-[#0d1117] border-white/10 text-left font-normal">
                    <span className="truncate">{projectFilter || "All projects"}</span>
                    <div className="flex items-center gap-1">
                      {projectFilter && (
                        <X className="h-3 w-3 opacity-50 hover:opacity-100"
                          onClick={e => { e.stopPropagation(); setProjectFilter(""); setSubmitted(false); }} />
                      )}
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search…" className="h-8" />
                    <CommandList>
                      <CommandEmpty>No projects found</CommandEmpty>
                      <CommandGroup>
                        {projects.map(p => (
                          <CommandItem key={p.id} value={p.project_number}
                            onSelect={() => { setProjectFilter(p.project_number); setProjectOpen(false); setSubmitted(false); }}>
                            <Check className={cn("mr-2 h-4 w-4",
                              projectFilter === p.project_number ? "opacity-100" : "opacity-0")} />
                            {p.project_number}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Leader */}
            <div className="space-y-1">
              <Label className="text-xs text-white/50">Team Leader</Label>
              <Popover open={leaderOpen} onOpenChange={setLeaderOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className="w-full h-8 text-xs justify-between bg-[#0d1117] border-white/10 text-left font-normal">
                    <span className="truncate">{leaderFilter || "All leaders"}</span>
                    <div className="flex items-center gap-1">
                      {leaderFilter && (
                        <X className="h-3 w-3 opacity-50 hover:opacity-100"
                          onClick={e => { e.stopPropagation(); setLeaderFilter(""); setSubmitted(false); }} />
                      )}
                      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search…" className="h-8" />
                    <CommandList>
                      <CommandEmpty>No leaders found</CommandEmpty>
                      <CommandGroup>
                        {teamLeaders.map(l => (
                          <CommandItem key={l.id} value={l.name}
                            onSelect={() => { setLeaderFilter(l.name); setLeaderOpen(false); setSubmitted(false); }}>
                            <Check className={cn("mr-2 h-4 w-4",
                              leaderFilter === l.name ? "opacity-100" : "opacity-0")} />
                            {l.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Run */}
            <div className="flex items-end">
              <Button size="sm" onClick={() => setSubmitted(true)}
                disabled={!dateFrom || !dateTo || isFetching}
                className="h-8 w-full text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold gap-1.5">
                {isFetching
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Filter className="h-3.5 w-3.5" />}
                Run Report
              </Button>
            </div>
          </div>

          {/* Active filter badges */}
          {(selectedIds.length > 0 || projectFilter || leaderFilter) && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/5">
              {selectedIds.map(id => {
                const name = devices.find(d => d.device_id === id)?.display_name ?? id;
                return (
                  <span key={id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs">
                    {name}
                    <X className="h-3 w-3 cursor-pointer hover:opacity-70"
                      onClick={() => { toggleDevice(id); setSubmitted(false); }} />
                  </span>
                );
              })}
              {projectFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs">
                  Project: {projectFilter}
                  <X className="h-3 w-3 cursor-pointer hover:opacity-70"
                    onClick={() => { setProjectFilter(""); setSubmitted(false); }} />
                </span>
              )}
              {leaderFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 text-xs">
                  Leader: {leaderFilter}
                  <X className="h-3 w-3 cursor-pointer hover:opacity-70"
                    onClick={() => { setLeaderFilter(""); setSubmitted(false); }} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto max-w-7xl px-4 pb-8">

        {!submitted && (
          <div className="text-center py-20 text-white/25 text-sm">
            Set your filters and click <span className="text-amber-400/70">Run Report</span> to view data.
          </div>
        )}

        {submitted && isFetching && (
          <div className="flex items-center justify-center gap-2 py-20 text-white/30 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading report data…
          </div>
        )}

        {submitted && !isFetching && rows.length === 0 && (
          <div className="text-center py-20 text-white/30 text-sm space-y-2">
            <p>No saved data found for <span className="text-white/50">{dateFrom}</span> – <span className="text-white/50">{dateTo}</span>.</p>
            <p className="text-xs text-white/20">
              Make sure the date range covers a period where annotations have been saved in the Mileage Log.
            </p>
          </div>
        )}

        {submitted && !isFetching && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-3 text-left font-medium">Date</th>
                  <th className="py-2.5 px-3 text-left font-medium">Vehicle</th>
                  <th className="py-2.5 px-3 text-right font-medium">GPS Mi</th>
                  <th className="py-2.5 px-3 text-right font-medium">Indirect</th>
                  <th className="py-2.5 px-3 text-right font-medium">Personal</th>
                  <th className="py-2.5 px-3 text-right font-medium">Direct</th>
                  <th className="py-2.5 px-3 text-left font-medium">Project</th>
                  <th className="py-2.5 px-3 text-left font-medium">Leader</th>
                  <th className="py-2.5 px-3 text-center font-medium print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayList.map(item => {

                  /* ── Saved row ────────────────────────────────────── */
                  if (item.kind === "row") {
                    const { row } = item;
                    const key     = rowKey(row);
                    const inEdit  = editMode.has(key);
                    const saving  = savingKeys.has(key);
                    const deleting = row.annotation_id != null && deletingIds.has(row.annotation_id);
                    const edit    = localEdits[key] ?? blankEdit();
                    const isSplit = row.split_index > 0;
                    const canEdit = row.annotation_id != null;

                    return (
                      <tr
                        key={key}
                        className={cn(
                          "border-b border-white/5 transition-colors",
                          isSplit ? "bg-blue-950/10 hover:bg-blue-950/20" : "hover:bg-white/[0.025]",
                          inEdit  && "bg-white/[0.04]",
                        )}
                      >
                        {/* Date */}
                        <td className={cn("py-2 px-3 font-mono text-xs",
                          isSplit ? "text-transparent select-none" : "")}>
                          {row.date}
                        </td>

                        {/* Vehicle */}
                        <td className="py-2 px-3 text-xs">
                          {isSplit
                            ? <span className="text-white/35 ml-3">└ split {row.split_index}</span>
                            : row.device_name}
                        </td>

                        {/* GPS Miles (primary row only) */}
                        <td className="py-2 px-3 text-right font-mono text-xs text-white/70">
                          {!isSplit && row.gps_miles != null ? row.gps_miles.toFixed(1) : ""}
                        </td>

                        {/* Indirect */}
                        <td className="py-2 px-3 text-right">
                          {inEdit
                            ? <MilesInput value={edit.indirect} color="text-amber-300"
                                onChange={v => patchEdit(key, { indirect: v })} />
                            : <span className="font-mono text-xs text-amber-400/80">
                                {row.indirect_miles > 0 ? row.indirect_miles.toFixed(1) : ""}
                              </span>}
                        </td>

                        {/* Personal */}
                        <td className="py-2 px-3 text-right">
                          {inEdit
                            ? <MilesInput value={edit.personal} color="text-purple-300"
                                onChange={v => patchEdit(key, { personal: v })} />
                            : <span className="font-mono text-xs text-purple-400/80">
                                {row.personal_miles > 0 ? row.personal_miles.toFixed(1) : ""}
                              </span>}
                        </td>

                        {/* Direct */}
                        <td className="py-2 px-3 text-right">
                          {inEdit
                            ? <MilesInput value={edit.direct} color="text-emerald-300"
                                onChange={v => patchEdit(key, { direct: v })} />
                            : <span className="font-mono text-xs text-emerald-400/80">
                                {row.direct_miles > 0 ? row.direct_miles.toFixed(1) : ""}
                              </span>}
                        </td>

                        {/* Project */}
                        <td className="py-2 px-3 text-xs">
                          {inEdit
                            ? <TextInput value={edit.project} list={DL_PROJ}
                                placeholder="Project #"
                                onChange={v => patchEdit(key, { project: v })} />
                            : <span className="text-white/80">{row.project_number}</span>}
                        </td>

                        {/* Leader */}
                        <td className="py-2 px-3 text-xs">
                          {inEdit
                            ? <TextInput value={edit.leader} list={DL_LEADER}
                                placeholder="Leader name"
                                onChange={v => patchEdit(key, { leader: v })} />
                            : <span className="text-white/80">{row.team_leader_name}</span>}
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-3 print:hidden">
                          <div className="flex items-center justify-center gap-1">
                            {inEdit ? (
                              <>
                                <button
                                  onClick={() => saveEdit(row)}
                                  disabled={saving}
                                  title="Save"
                                  className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40 transition-colors">
                                  {saving
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Save className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => cancelEdit(key)}
                                  disabled={saving}
                                  title="Cancel"
                                  className="p-1 rounded text-white/40 hover:bg-white/10 disabled:opacity-40 transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                {canEdit && (
                                  <button
                                    onClick={() => startEdit(row)}
                                    title="Edit row"
                                    className="p-1 rounded text-white/30 hover:text-amber-400 hover:bg-amber-400/10 transition-colors">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {/* Scissors: add split — only on primary annotated rows */}
                                {!isSplit && canEdit && (
                                  <button
                                    onClick={() => addPendingSplit(row)}
                                    title="Split mileage"
                                    className="p-1 rounded text-white/30 hover:text-sky-400 hover:bg-sky-400/10 transition-colors">
                                    <Scissors className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {/* Delete: only on saved split rows */}
                                {isSplit && canEdit && (
                                  <button
                                    onClick={() => deleteSplit(row)}
                                    disabled={deleting}
                                    title="Remove split"
                                    className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors">
                                    {deleting
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <X className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  /* ── Pending (new unsaved) split row ──────────────── */
                  const { parentRow, idx } = item;
                  const gk         = groupKey(parentRow);
                  const pendingKey = `${gk}_pending_${idx}`;
                  const savingP    = savingKeys.has(pendingKey);
                  const pendEdit   = (pendingSplits[gk] ?? [])[idx] ?? blankEdit();

                  return (
                    <tr
                      key={pendingKey}
                      className="border-b border-white/5 bg-sky-950/20 hover:bg-sky-950/30 transition-colors"
                    >
                      {/* Date — blank */}
                      <td className="py-2 px-3 text-transparent select-none text-xs font-mono">
                        {parentRow.date}
                      </td>

                      {/* Vehicle label */}
                      <td className="py-2 px-3 text-xs">
                        <span className="text-sky-400/60 ml-3 flex items-center gap-1">
                          <Plus className="h-3 w-3" />
                          new split
                        </span>
                      </td>

                      {/* GPS Miles — blank */}
                      <td />

                      {/* Indirect */}
                      <td className="py-2 px-3 text-right">
                        <MilesInput value={pendEdit.indirect} color="text-amber-300"
                          onChange={v => patchPending(gk, idx, { indirect: v })} />
                      </td>

                      {/* Personal */}
                      <td className="py-2 px-3 text-right">
                        <MilesInput value={pendEdit.personal} color="text-purple-300"
                          onChange={v => patchPending(gk, idx, { personal: v })} />
                      </td>

                      {/* Direct */}
                      <td className="py-2 px-3 text-right">
                        <MilesInput value={pendEdit.direct} color="text-emerald-300"
                          onChange={v => patchPending(gk, idx, { direct: v })} />
                      </td>

                      {/* Project */}
                      <td className="py-2 px-3">
                        <TextInput value={pendEdit.project} list={DL_PROJ}
                          placeholder="Project #"
                          onChange={v => patchPending(gk, idx, { project: v })} />
                      </td>

                      {/* Leader */}
                      <td className="py-2 px-3">
                        <TextInput value={pendEdit.leader} list={DL_LEADER}
                          placeholder="Leader name"
                          onChange={v => patchPending(gk, idx, { leader: v })} />
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 print:hidden">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => savePending(parentRow, idx)}
                            disabled={savingP}
                            title="Save split"
                            className="p-1 rounded text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40 transition-colors">
                            {savingP
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => cancelPending(gk, idx)}
                            disabled={savingP}
                            title="Cancel"
                            className="p-1 rounded text-white/40 hover:bg-white/10 disabled:opacity-40 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-white/20 bg-white/[0.04] text-xs font-semibold">
                  <td className="py-2.5 px-3 text-white/40" colSpan={2}>
                    Totals — {rows.length} row{rows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-white/70">
                    {totals.gps.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-400/80">
                    {totals.indirect.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-purple-400/80">
                    {totals.personal.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-400/80">
                    {totals.direct.toFixed(1)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
