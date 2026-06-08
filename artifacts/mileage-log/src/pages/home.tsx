import { useState, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Truck, Filter, Printer, Download, Loader2, ChevronDown, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import {
  getGetMileageSummaryQueryOptions,
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
  useCreateProject,
  useCreateTeamLeader,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const now = new Date();
const DEFAULT_FROM = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
const DEFAULT_TO = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

interface RowAnnotation {
  indirect: string;
  personal: string;
  direct: string;
  project: string;
  leader: string;
}

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  allowNew?: boolean;
  onCreateNew?: (v: string) => Promise<void>;
}

function Combobox({ value, onChange, options, placeholder, allowNew, onCreateNew }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "w-full h-full text-left px-2 text-xs flex items-center justify-between gap-1 bg-transparent hover:bg-white/10 transition-colors rounded",
          !value && "text-white/30"
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
              {isNew ? (
                <button onClick={handleCreate} disabled={creating}
                  className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-muted/60 text-primary">
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Add "{search.trim()}"
                </button>
              ) : <p className="text-center text-xs text-muted-foreground py-3">No results.</p>}
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
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM);
  const [dateTo, setDateTo] = useState(DEFAULT_TO);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [truckOpen, setTruckOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [annotations, setAnnotations] = useState<Record<string, RowAnnotation>>({});

  const { data: devices = [], isLoading: devicesLoading } = useGetGpsDevices();
  const { data: projects = [] } = useListProjects();
  const { data: teamLeaders = [] } = useListTeamLeaders();
  const projectOptions = useMemo(() => projects.map(p => p.project_number), [projects]);
  const leaderOptions = useMemo(() => teamLeaders.map(t => t.name), [teamLeaders]);

  const createProject = useCreateProject();
  const createLeader = useCreateTeamLeader();

  const handleCreateProject = async (name: string) => {
    await createProject.mutateAsync({ data: { project_number: name } });
    qc.invalidateQueries({ queryKey: ["/api/projects"] });
  };
  const handleCreateLeader = async (name: string) => {
    await createLeader.mutateAsync({ data: { name } });
    qc.invalidateQueries({ queryKey: ["/api/team-leaders"] });
  };

  const isAllSelected = selectedIds.length === devices.length && devices.length > 0;

  const toggleTruck = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setSubmitted(false);
  };

  const toggleAll = () => {
    setSelectedIds(isAllSelected ? [] : devices.map(d => d.device_id));
    setSubmitted(false);
  };

  const activeIds = submitted ? selectedIds : [];

  const queries = useQueries({
    queries: activeIds.map(deviceId =>
      getGetMileageSummaryQueryOptions({ device_id: deviceId, from: dateFrom, to: dateTo })
    ),
  });

  const isLoading = submitted && queries.some(q => q.isFetching);

  const allRows = useMemo(() => {
    if (!submitted) return [];
    const rows: {
      key: string; deviceId: string; deviceName: string; date: string;
      beginOdo: number; endOdo: number; gpsMiles: number;
    }[] = [];
    queries.forEach((q, i) => {
      if (!q.data) return;
      const deviceId = activeIds[i];
      const deviceName = devices.find(d => d.device_id === deviceId)?.display_name ?? deviceId;
      (q.data.daily_logs ?? [])
        .filter(l => l.miles_driven > 0)
        .forEach(l => {
          rows.push({
            key: `${deviceId}_${l.date}`,
            deviceId,
            deviceName,
            date: l.date,
            beginOdo: l.start_odometer_miles,
            endOdo: l.end_odometer_miles,
            gpsMiles: l.miles_driven,
          });
        });
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.deviceName.localeCompare(b.deviceName));
  }, [queries, submitted, activeIds, devices]);

  const setAnnotation = useCallback((key: string, field: keyof RowAnnotation, value: string) => {
    setAnnotations(prev => ({
      ...prev,
      [key]: { indirect: "", personal: "", direct: "", project: "", leader: "", ...prev[key], [field]: value },
    }));
  }, []);

  const getAnnotation = (key: string): RowAnnotation =>
    annotations[key] ?? { indirect: "", personal: "", direct: "", project: "", leader: "" };

  const handleGenerate = () => {
    if (selectedIds.length === 0 || !dateFrom || !dateTo) return;
    setSubmitted(false);
    setTimeout(() => setSubmitted(true), 0);
  };

  const handleExportCSV = () => {
    if (!allRows.length) return;
    const headers = ["DATE", "VEHICLE", "BEGIN ODOMETER", "END ODOMETER", "INDIRECT", "PERSONAL/UNALLOWABLE", "JOB (DIRECT)", "PROJECT NUMBER", "TOTAL MILES", "TEAM LEADER"];
    const rows = allRows.map(r => {
      const ann = getAnnotation(r.key);
      const indirect = parseFloat(ann.indirect) || 0;
      const personal = parseFloat(ann.personal) || 0;
      const direct = parseFloat(ann.direct) || r.gpsMiles;
      const total = indirect + personal + direct;
      return [
        r.date, r.deviceName,
        r.beginOdo.toFixed(1), r.endOdo.toFixed(1),
        indirect > 0 ? indirect.toFixed(1) : "",
        personal > 0 ? personal.toFixed(1) : "",
        direct.toFixed(1),
        ann.project, total.toFixed(1), ann.leader,
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mileage-log-${dateFrom}-to-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const truckLabel = devicesLoading
    ? "Loading trucks…"
    : selectedIds.length === 0
    ? "Select trucks…"
    : isAllSelected
    ? "All Trucks"
    : selectedIds.length === 1
    ? devices.find(d => d.device_id === selectedIds[0])?.display_name ?? "1 truck"
    : `${selectedIds.length} trucks`;

  const grandTotal = allRows.reduce((sum, r) => {
    const ann = getAnnotation(r.key);
    const i = parseFloat(ann.indirect) || 0;
    const p = parseFloat(ann.personal) || 0;
    const d = parseFloat(ann.direct) || r.gpsMiles;
    return sum + i + p + d;
  }, 0);

  return (
    <div className="min-h-screen bg-[#0d1117] text-foreground dark pb-20">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0d1117]/90 backdrop-blur sticky top-0 z-10 print:hidden">
        <div className="container mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="h-5 w-5 text-amber-400" />
            <span className="font-bold text-base tracking-tight">FleetLog</span>
            <span className="text-xs text-white/30 font-mono ml-1">Mileage Log</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()}
              className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10">
              <Printer className="h-3.5 w-3.5 mr-1.5" />Print
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportCSV} disabled={!allRows.length}
              className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10">
              <Download className="h-3.5 w-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
        </div>
      </header>

      {/* Print header */}
      <div className="hidden print:block text-center py-4 border-b border-black mb-4">
        <h1 className="text-xl font-bold">Fleet Mileage Log</h1>
        <p className="text-sm text-gray-600">{dateFrom} — {dateTo} · Generated {format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      <main className="container mx-auto max-w-7xl px-4 mt-5">

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 mb-5 print:hidden">
          {/* Multi-truck selector */}
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
                    <div className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      isAllSelected ? "bg-amber-500 border-amber-500" : "border-white/30"
                    )}>
                      {isAllSelected && <Check className="h-2.5 w-2.5 text-black" />}
                    </div>
                    <span className="font-medium">All Trucks</span>
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  {devices.map(d => (
                    <button key={d.device_id} onClick={() => toggleTruck(d.device_id)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-sm hover:bg-muted/60 transition-colors">
                      <div className={cn(
                        "h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        selectedIds.includes(d.device_id) ? "bg-amber-500 border-amber-500" : "border-white/30"
                      )}>
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
            disabled={selectedIds.length === 0 || !dateFrom || !dateTo || isLoading}
            className="h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm">
            {isLoading
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
              : <><Filter className="h-4 w-4 mr-1.5" />Generate Log</>}
          </Button>

          {submitted && !isLoading && allRows.length > 0 && (
            <span className="text-xs text-white/40 self-end pb-2">
              {allRows.length} driving day{allRows.length !== 1 ? "s" : ""} ·{" "}
              <span className="text-amber-400 font-mono font-semibold">{grandTotal.toFixed(1)} mi total</span>
            </span>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {[
                    { label: "DATE", cls: "w-[110px]" },
                    { label: "VEHICLE", cls: "w-[110px]" },
                    { label: "BEGIN ODO", cls: "w-[100px] text-right" },
                    { label: "END ODO", cls: "w-[100px] text-right" },
                    { label: "INDIRECT", cls: "w-[90px]" },
                    { label: "PERSONAL / UNALLOWABLE", cls: "w-[90px]" },
                    { label: "JOB (DIRECT)", cls: "w-[90px]" },
                    { label: "PROJECT NUMBER", cls: "w-[180px]" },
                    { label: "TOTAL MILES", cls: "w-[90px] text-right" },
                    { label: "TEAM LEADER", cls: "w-[160px]" },
                  ].map(h => (
                    <th key={h.label} className={cn(
                      "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/35 whitespace-nowrap",
                      h.cls
                    )}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!submitted ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <Truck className="h-8 w-8 mx-auto mb-3 text-white/10" />
                      <p className="text-white/25 text-sm">Select trucks and a date range, then click Generate Log.</p>
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-amber-400/50" />
                      <p className="text-white/30 text-sm">Pulling GPS data…</p>
                    </td>
                  </tr>
                ) : allRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <p className="text-white/30 text-sm">No driving days found for the selected period.</p>
                    </td>
                  </tr>
                ) : (
                  allRows.map((row, i) => {
                    const ann = getAnnotation(row.key);
                    const indirect = parseFloat(ann.indirect) || 0;
                    const personal = parseFloat(ann.personal) || 0;
                    const direct = ann.direct !== "" ? parseFloat(ann.direct) : row.gpsMiles;
                    const total = indirect + personal + direct;
                    return (
                      <tr key={row.key}
                        className={cn("border-b border-white/5 hover:bg-white/[0.03] transition-colors group",
                          i % 2 !== 0 && "bg-white/[0.015]")}>
                        {/* DATE */}
                        <td className="px-3 py-1.5 font-mono text-xs text-white/70 whitespace-nowrap">{row.date}</td>
                        {/* VEHICLE */}
                        <td className="px-3 py-1.5 text-xs text-amber-400/80 whitespace-nowrap">{row.deviceName}</td>
                        {/* BEGIN ODO */}
                        <td className="px-3 py-1.5 font-mono text-xs text-white/45 text-right">{row.beginOdo.toFixed(1)}</td>
                        {/* END ODO */}
                        <td className="px-3 py-1.5 font-mono text-xs text-white/45 text-right">{row.endOdo.toFixed(1)}</td>
                        {/* INDIRECT */}
                        <td className="px-1.5 py-1">
                          <Input
                            type="number" min="0" step="0.1" placeholder="—"
                            value={ann.indirect}
                            onChange={e => setAnnotation(row.key, "indirect", e.target.value)}
                            className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2"
                          />
                        </td>
                        {/* PERSONAL */}
                        <td className="px-1.5 py-1">
                          <Input
                            type="number" min="0" step="0.1" placeholder="—"
                            value={ann.personal}
                            onChange={e => setAnnotation(row.key, "personal", e.target.value)}
                            className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/15 px-2"
                          />
                        </td>
                        {/* DIRECT */}
                        <td className="px-1.5 py-1">
                          <Input
                            type="number" min="0" step="0.1"
                            placeholder={row.gpsMiles.toFixed(1)}
                            value={ann.direct}
                            onChange={e => setAnnotation(row.key, "direct", e.target.value)}
                            className="h-7 w-full text-xs font-mono bg-white/5 border-white/10 focus:border-amber-500/50 focus:bg-white/10 placeholder:text-white/40 px-2"
                          />
                        </td>
                        {/* PROJECT */}
                        <td className="px-1.5 py-1">
                          <div className="h-7 rounded border border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10 transition-colors">
                            <Combobox
                              value={ann.project}
                              onChange={v => setAnnotation(row.key, "project", v)}
                              options={projectOptions}
                              placeholder="Project…"
                              allowNew
                              onCreateNew={handleCreateProject}
                            />
                          </div>
                        </td>
                        {/* TOTAL */}
                        <td className="px-3 py-1.5 font-mono text-xs font-bold text-white text-right whitespace-nowrap">
                          {total.toFixed(1)}
                        </td>
                        {/* TEAM LEADER */}
                        <td className="px-1.5 py-1">
                          <div className="h-7 rounded border border-white/10 bg-white/5 focus-within:border-amber-500/50 focus-within:bg-white/10 transition-colors">
                            <Combobox
                              value={ann.leader}
                              onChange={v => setAnnotation(row.key, "leader", v)}
                              options={leaderOptions}
                              placeholder="Leader…"
                              allowNew
                              onCreateNew={handleCreateLeader}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {allRows.length > 0 && !isLoading && (
                <tfoot>
                  <tr className="border-t-2 border-amber-500/30 bg-amber-500/5">
                    <td colSpan={4} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/35">
                      {allRows.length} day{allRows.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white/60">
                      {allRows.reduce((s, r) => s + (parseFloat(getAnnotation(r.key).indirect) || 0), 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white/60">
                      {allRows.reduce((s, r) => s + (parseFloat(getAnnotation(r.key).personal) || 0), 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white/80">
                      {allRows.reduce((s, r) => {
                        const ann = getAnnotation(r.key);
                        return s + (ann.direct !== "" ? parseFloat(ann.direct) || 0 : r.gpsMiles);
                      }, 0).toFixed(1)}
                    </td>
                    <td />
                    <td className="px-3 py-2 font-mono text-sm font-bold text-amber-400">{grandTotal.toFixed(1)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
