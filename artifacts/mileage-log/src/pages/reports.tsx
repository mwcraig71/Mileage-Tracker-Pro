import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { BarChart2, Download, Printer, ChevronDown, Check, Filter, ArrowLeft, X, Loader2 } from "lucide-react";
import { Link } from "wouter";
import {
  useGetReports,
  useGetGpsDevices,
  useListProjects,
  useListTeamLeaders,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const now = new Date();
const DEFAULT_FROM = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
const DEFAULT_TO   = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

export default function Reports() {
  const [dateFrom, setDateFrom]             = useState(DEFAULT_FROM);
  const [dateTo, setDateTo]                 = useState(DEFAULT_TO);
  const [selectedIds, setSelectedIds]       = useState<string[]>([]);
  const [projectFilter, setProjectFilter]   = useState("");
  const [leaderFilter, setLeaderFilter]     = useState("");
  const [submitted, setSubmitted]           = useState(false);
  const [deviceOpen, setDeviceOpen]         = useState(false);
  const [projectOpen, setProjectOpen]       = useState(false);
  const [leaderOpen, setLeaderOpen]         = useState(false);

  const { data: devices = [] }     = useGetGpsDevices();
  const { data: projects = [] }    = useListProjects();
  const { data: teamLeaders = [] } = useListTeamLeaders();

  const params = {
    from: dateFrom,
    to:   dateTo,
    ...(selectedIds.length > 0 ? { "device_ids[]": selectedIds } : {}),
    ...(projectFilter ? { project: projectFilter } : {}),
    ...(leaderFilter  ? { leader:  leaderFilter  } : {}),
  };

  const { data: rows = [], isFetching } = useGetReports(params, {
    query: { enabled: submitted && !!dateFrom && !!dateTo },
  });

  const totals = useMemo(() => ({
    gps:      rows.reduce((s, r) => s + (r.gps_miles ?? 0),  0),
    indirect: rows.reduce((s, r) => s + r.indirect_miles,    0),
    personal: rows.reduce((s, r) => s + r.personal_miles,    0),
    direct:   rows.reduce((s, r) => s + r.direct_miles,      0),
  }), [rows]);

  const handleRunReport = () => setSubmitted(true);

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
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
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
              <Button size="sm" onClick={handleRunReport}
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
          <div className="text-center py-20 text-white/30 text-sm space-y-1">
            <p>No data found for the selected filters.</p>
            <p className="text-xs text-white/20">
              GPS data is cached when you generate a mileage log. Open the Mileage Log tab and
              generate a log for this date range first.
            </p>
          </div>
        )}

        {submitted && !isFetching && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-white/50 text-xs uppercase tracking-wide">
                  <th className="py-2.5 px-4 text-left font-medium">Date</th>
                  <th className="py-2.5 px-4 text-left font-medium">Vehicle</th>
                  <th className="py-2.5 px-4 text-right font-medium">GPS Miles</th>
                  <th className="py-2.5 px-4 text-right font-medium">Indirect</th>
                  <th className="py-2.5 px-4 text-right font-medium">Personal</th>
                  <th className="py-2.5 px-4 text-right font-medium">Direct</th>
                  <th className="py-2.5 px-4 text-left font-medium">Project</th>
                  <th className="py-2.5 px-4 text-left font-medium">Leader</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr
                    key={`${row.device_id}_${row.date}_${row.split_index}`}
                    className={cn(
                      "border-b border-white/5 hover:bg-white/[0.025] transition-colors",
                      row.split_index > 0 && "bg-blue-950/10",
                    )}>
                    <td className={cn("py-2 px-4 font-mono text-xs",
                      row.split_index > 0 ? "text-transparent select-none" : "")}>
                      {row.date}
                    </td>
                    <td className="py-2 px-4 text-xs">
                      {row.split_index > 0
                        ? <span className="text-white/35 ml-3">└ split {row.split_index}</span>
                        : row.device_name}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-white/70">
                      {row.split_index === 0 && row.gps_miles != null ? row.gps_miles.toFixed(1) : ""}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-amber-400/80">
                      {row.indirect_miles > 0 ? row.indirect_miles.toFixed(1) : ""}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-purple-400/80">
                      {row.personal_miles > 0 ? row.personal_miles.toFixed(1) : ""}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-xs text-emerald-400/80">
                      {row.direct_miles > 0 ? row.direct_miles.toFixed(1) : ""}
                    </td>
                    <td className="py-2 px-4 text-xs text-white/80">{row.project_number}</td>
                    <td className="py-2 px-4 text-xs text-white/80">{row.team_leader_name}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/20 bg-white/[0.04] text-xs font-semibold">
                  <td className="py-2.5 px-4 text-white/40" colSpan={2}>
                    Totals — {rows.length} row{rows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-white/70">
                    {totals.gps.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-amber-400/80">
                    {totals.indirect.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-purple-400/80">
                    {totals.personal.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-400/80">
                    {totals.direct.toFixed(1)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
