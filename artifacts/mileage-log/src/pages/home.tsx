import { useState, useMemo } from "react";
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, subMonths,
} from "date-fns";
import {
  Truck, Plus, Trash2, Printer, Download, Loader2, X, Check, ChevronsUpDown,
} from "lucide-react";
import {
  useGetGpsDevices,
  useGetOdometerRange,
  useListProjects,
  useListTeamLeaders,
  useListLogEntries,
  useCreateProject,
  useCreateTeamLeader,
  useCreateLogEntry,
  useDeleteLogEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type DatePreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";

function getPresetRange(preset: DatePreset, customFrom: string, customTo: string) {
  const now = new Date();
  if (preset === "this-week") return { from: format(startOfWeek(now), "yyyy-MM-dd"), to: format(endOfWeek(now), "yyyy-MM-dd") };
  if (preset === "last-week") { const lw = subDays(now, 7); return { from: format(startOfWeek(lw), "yyyy-MM-dd"), to: format(endOfWeek(lw), "yyyy-MM-dd") }; }
  if (preset === "this-month") return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
  if (preset === "last-month") { const lm = subMonths(now, 1); return { from: format(startOfMonth(lm), "yyyy-MM-dd"), to: format(endOfMonth(lm), "yyyy-MM-dd") }; }
  return { from: customFrom, to: customTo };
}

interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  allowNew?: boolean;
  onCreateNew?: (v: string) => Promise<void>;
  disabled?: boolean;
}

function Combobox({ value, onChange, options, placeholder, allowNew, onCreateNew, disabled }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const isNew = allowNew && search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  const handleCreate = async () => {
    if (!onCreateNew || !search.trim()) return;
    setCreating(true);
    try {
      await onCreateNew(search.trim());
      onChange(search.trim());
      setOpen(false);
      setSearch("");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between h-9 bg-background/50 border-border/60 font-normal text-sm"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={`Search or add new…`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isNew ? (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/60 text-primary"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add "{search.trim()}"
                </button>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-4">No results.</p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map(opt => (
                <CommandItem key={opt} value={opt} onSelect={() => handleSelect(opt)}>
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
              {isNew && filtered.length > 0 && (
                <CommandItem
                  value={`__new__${search}`}
                  onSelect={handleCreate}
                  className="text-primary"
                >
                  {creating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
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

const EMPTY_FORM = {
  deviceId: "",
  datePreset: "this-week" as DatePreset,
  customFrom: format(startOfWeek(new Date()), "yyyy-MM-dd"),
  customTo: format(endOfWeek(new Date()), "yyyy-MM-dd"),
  beginOdometer: "",
  endOdometer: "",
  indirectMiles: "",
  personalMiles: "",
  directMiles: "",
  projectNumber: "",
  teamLeaderName: "",
};

export default function Home() {
  const qc = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [gpsLoaded, setGpsLoaded] = useState(false);
  const [fetchOdo, setFetchOdo] = useState(false);
  const [saving, setSaving] = useState(false);

  const { from, to } = getPresetRange(form.datePreset, form.customFrom, form.customTo);

  const { data: devices = [], isLoading: devicesLoading } = useGetGpsDevices();
  const { data: projects = [] } = useListProjects();
  const { data: teamLeaders = [] } = useListTeamLeaders();
  const { data: entries = [], isLoading: entriesLoading } = useListLogEntries();

  const projectOptions = useMemo(() => projects.map(p => p.project_number), [projects]);
  const leaderOptions = useMemo(() => teamLeaders.map(t => t.name), [teamLeaders]);

  const { data: odoRange, isFetching: odoFetching } = useGetOdometerRange(
    { device_id: form.deviceId, from, to },
    { query: { enabled: fetchOdo && !!form.deviceId && !!from && !!to } }
  );

  const createProject = useCreateProject();
  const createLeader = useCreateTeamLeader();
  const createEntry = useCreateLogEntry();
  const deleteEntry = useDeleteLogEntry();

  const setField = (key: keyof typeof EMPTY_FORM, val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleFetchOdo = () => {
    if (!form.deviceId) return;
    setFetchOdo(false);
    setTimeout(() => setFetchOdo(true), 0);
    setGpsLoaded(false);
  };

  if (odoRange && fetchOdo && !gpsLoaded) {
    setForm(f => ({
      ...f,
      beginOdometer: odoRange.begin_odometer_miles.toFixed(1),
      endOdometer: odoRange.end_odometer_miles.toFixed(1),
      directMiles: odoRange.total_miles.toFixed(1),
    }));
    setGpsLoaded(true);
  }

  const totalMiles = (
    (parseFloat(form.indirectMiles) || 0) +
    (parseFloat(form.personalMiles) || 0) +
    (parseFloat(form.directMiles) || 0)
  );

  const selectedDevice = devices.find(d => d.device_id === form.deviceId);

  const handleSave = async () => {
    if (!form.deviceId || !form.beginOdometer || !form.endOdometer || !form.projectNumber || !form.teamLeaderName) return;
    setSaving(true);
    try {
      await createEntry.mutateAsync({
        data: {
          device_id: form.deviceId,
          device_name: selectedDevice?.display_name ?? form.deviceId,
          start_date: from,
          end_date: to,
          begin_odometer: parseFloat(form.beginOdometer),
          end_odometer: parseFloat(form.endOdometer),
          indirect_miles: parseFloat(form.indirectMiles) || 0,
          personal_miles: parseFloat(form.personalMiles) || 0,
          direct_miles: parseFloat(form.directMiles) || 0,
          project_number: form.projectNumber,
          team_leader_name: form.teamLeaderName,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/log-entries"] });
      setShowAddDialog(false);
      setForm(EMPTY_FORM);
      setFetchOdo(false);
      setGpsLoaded(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteEntry.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: ["/api/log-entries"] });
  };

  const handleCreateProject = async (name: string) => {
    await createProject.mutateAsync({ data: { project_number: name } });
    qc.invalidateQueries({ queryKey: ["/api/projects"] });
  };

  const handleCreateLeader = async (name: string) => {
    await createLeader.mutateAsync({ data: { name } });
    qc.invalidateQueries({ queryKey: ["/api/team-leaders"] });
  };

  const handleExportCSV = () => {
    if (!entries.length) return;
    const headers = ["START DATE","END DATE","BEGIN ODOMETER","END ODOMETER","INDIRECT","PERSONAL/UNALLOWABLE","JOB (DIRECT)","PROJECT NUMBER","TOTAL MILES","Team Leader","Vehicle"];
    const rows = entries.map(e => [
      e.start_date, e.end_date,
      e.begin_odometer.toFixed(1), e.end_odometer.toFixed(1),
      e.indirect_miles.toFixed(1), e.personal_miles.toFixed(1), e.direct_miles.toFixed(1),
      e.project_number, e.total_miles.toFixed(1),
      e.team_leader_name, e.device_name,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mileage-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grandTotal = entries.reduce((s, e) => s + e.total_miles, 0);
  const grandDirect = entries.reduce((s, e) => s + e.direct_miles, 0);
  const grandIndirect = entries.reduce((s, e) => s + e.indirect_miles, 0);
  const grandPersonal = entries.reduce((s, e) => s + e.personal_miles, 0);

  const canSave = !!form.deviceId && !!form.beginOdometer && !!form.endOdometer && !!form.projectNumber && !!form.teamLeaderName;

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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.print()}
              className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportCSV}
              disabled={!entries.length}
              className="h-8 text-xs text-white/60 hover:text-white hover:bg-white/10"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              onClick={() => { setForm(EMPTY_FORM); setFetchOdo(false); setGpsLoaded(false); setShowAddDialog(true); }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Entry
            </Button>
          </div>
        </div>
      </header>

      {/* Print header */}
      <div className="hidden print:block text-center py-4 border-b border-black mb-4">
        <h1 className="text-xl font-bold">Fleet Mileage Log</h1>
        <p className="text-sm text-gray-600">Generated {format(new Date(), "MMMM d, yyyy")}</p>
      </div>

      <main className="container mx-auto max-w-7xl px-4 mt-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 print:hidden">
          {[
            { label: "Total Miles", value: grandTotal.toFixed(1) },
            { label: "Direct (Job)", value: grandDirect.toFixed(1) },
            { label: "Indirect", value: grandIndirect.toFixed(1) },
            { label: "Personal", value: grandPersonal.toFixed(1) },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-xl font-bold font-mono text-amber-400">{value}</p>
            </div>
          ))}
        </div>

        {/* Log Table */}
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  {[
                    "START DATE","END DATE","BEGIN ODOMETER","END ODOMETER",
                    "INDIRECT","PERSONAL / UNALLOWABLE","JOB (DIRECT)",
                    "PROJECT NUMBER","TOTAL MILES","TEAM LEADER","VEHICLE","",
                  ].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-white/40 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entriesLoading ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-white/30 text-sm">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-400/40" />
                      Loading log entries…
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center">
                      <Truck className="h-8 w-8 mx-auto mb-3 text-white/10" />
                      <p className="text-white/30 text-sm">No entries yet.</p>
                      <p className="text-white/20 text-xs mt-1">Click "Add Entry" to log mileage.</p>
                    </td>
                  </tr>
                ) : (
                  entries.map((e, i) => (
                    <tr key={e.id} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", i % 2 === 0 ? "" : "bg-white/[0.02]")}>
                      <td className="px-3 py-2 font-mono text-xs text-white/70">{e.start_date}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/70">{e.end_date}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/60">{e.begin_odometer.toFixed(1)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/60">{e.end_odometer.toFixed(1)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/60">{e.indirect_miles > 0 ? e.indirect_miles.toFixed(1) : ""}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/60">{e.personal_miles > 0 ? e.personal_miles.toFixed(1) : ""}</td>
                      <td className="px-3 py-2 font-mono text-xs text-white/80 font-semibold">{e.direct_miles > 0 ? e.direct_miles.toFixed(1) : ""}</td>
                      <td className="px-3 py-2 text-xs text-amber-400 font-medium">{e.project_number}</td>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-white">{e.total_miles.toFixed(1)}</td>
                      <td className="px-3 py-2 text-xs text-white/70">{e.team_leader_name}</td>
                      <td className="px-3 py-2 text-xs text-white/50">{e.device_name}</td>
                      <td className="px-3 py-2 print:hidden">
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-white/20 hover:text-red-400 transition-colors"
                          title="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-amber-500/30 bg-amber-500/5">
                    <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/40">Totals</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-white/70">{grandIndirect.toFixed(1)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-white/70">{grandPersonal.toFixed(1)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-white/80">{grandDirect.toFixed(1)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 font-mono text-sm font-bold text-amber-400">{grandTotal.toFixed(1)}</td>
                    <td colSpan={3} className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </main>

      {/* Add Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!saving) { setShowAddDialog(o); if (!o) { setFetchOdo(false); setGpsLoaded(false); } } }}>
        <DialogContent className="sm:max-w-[640px] bg-[#161b22] border-white/10 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4 text-amber-400" />
              New Mileage Entry
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Truck + Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Vehicle</Label>
                <Select
                  value={form.deviceId}
                  onValueChange={v => { setField("deviceId", v); setGpsLoaded(false); setFetchOdo(false); }}
                  disabled={devicesLoading}
                >
                  <SelectTrigger className="h-9 bg-background/30 border-white/10 text-sm">
                    <SelectValue placeholder={devicesLoading ? "Loading…" : "Select truck"} />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(d => (
                      <SelectItem key={d.device_id} value={d.device_id}>{d.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Date Preset</Label>
                <Select
                  value={form.datePreset}
                  onValueChange={v => { setField("datePreset", v as DatePreset); setGpsLoaded(false); setFetchOdo(false); }}
                >
                  <SelectTrigger className="h-9 bg-background/30 border-white/10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-week">This Week</SelectItem>
                    <SelectItem value="last-week">Last Week</SelectItem>
                    <SelectItem value="this-month">This Month</SelectItem>
                    <SelectItem value="last-month">Last Month</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.datePreset === "custom" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">Start Date</Label>
                  <Input type="date" value={form.customFrom} onChange={e => { setField("customFrom", e.target.value); setGpsLoaded(false); setFetchOdo(false); }} className="h-9 bg-background/30 border-white/10 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50 uppercase tracking-wider">End Date</Label>
                  <Input type="date" value={form.customTo} onChange={e => { setField("customTo", e.target.value); setGpsLoaded(false); setFetchOdo(false); }} className="h-9 bg-background/30 border-white/10 text-sm" />
                </div>
              </div>
            )}

            {form.datePreset !== "custom" && (
              <div className="text-xs text-white/30 font-mono bg-white/5 rounded px-3 py-2">
                {from} → {to}
              </div>
            )}

            {/* GPS Pull Button + Odometer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Odometer Readings (miles)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!form.deviceId || odoFetching}
                  onClick={handleFetchOdo}
                  className="h-7 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 px-2"
                >
                  {odoFetching ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Truck className="h-3 w-3 mr-1" />}
                  Pull from GPS
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/30">BEGIN ODOMETER</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={form.beginOdometer}
                    onChange={e => setField("beginOdometer", e.target.value)}
                    className="h-9 bg-background/30 border-white/10 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-white/30">END ODOMETER</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={form.endOdometer}
                    onChange={e => setField("endOdometer", e.target.value)}
                    className="h-9 bg-background/30 border-white/10 text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Mileage Breakdown */}
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50 uppercase tracking-wider">Mileage Breakdown</Label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: "indirectMiles" as const, label: "INDIRECT" },
                  { key: "personalMiles" as const, label: "PERSONAL / UNALLOWABLE" },
                  { key: "directMiles" as const, label: "JOB (DIRECT)" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px] text-white/30 leading-none">{label}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="0.0"
                      value={form[key]}
                      onChange={e => setField(key, e.target.value)}
                      className="h-9 bg-background/30 border-white/10 text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <span className="text-xs text-white/40 font-mono">
                  Total: <span className="text-amber-400 font-semibold">{totalMiles.toFixed(1)} mi</span>
                </span>
              </div>
            </div>

            {/* Project + Team Leader */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Project Number</Label>
                <Combobox
                  value={form.projectNumber}
                  onChange={v => setField("projectNumber", v)}
                  options={projectOptions}
                  placeholder="Select or add project…"
                  allowNew
                  onCreateNew={handleCreateProject}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50 uppercase tracking-wider">Team Leader</Label>
                <Combobox
                  value={form.teamLeaderName}
                  onChange={v => setField("teamLeaderName", v)}
                  options={leaderOptions}
                  placeholder="Select or add leader…"
                  allowNew
                  onCreateNew={handleCreateLeader}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => { setShowAddDialog(false); setFetchOdo(false); setGpsLoaded(false); }}
              disabled={saving}
              className="text-white/50 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
