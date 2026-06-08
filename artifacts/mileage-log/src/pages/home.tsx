import { useState } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Download, Printer, Truck, Calendar as CalendarIcon, Filter, MapPin, AlertCircle } from "lucide-react";
import { useGetGpsDevices, useGetMileageSummary, getGetMileageSummaryQueryKey } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type DateRangePreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";

export default function Home() {
  const [deviceId, setDeviceId] = useState<string>("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("this-week");
  const [customFrom, setCustomFrom] = useState<string>(format(startOfWeek(new Date()), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState<string>(format(endOfWeek(new Date()), "yyyy-MM-dd"));
  
  const [submitted, setSubmitted] = useState(false);

  const { data: devices = [], isLoading: isLoadingDevices } = useGetGpsDevices();

  let from = customFrom;
  let to = customTo;

  const now = new Date();
  if (datePreset === "this-week") {
    from = format(startOfWeek(now), "yyyy-MM-dd");
    to = format(endOfWeek(now), "yyyy-MM-dd");
  } else if (datePreset === "last-week") {
    const lastWeek = subDays(now, 7);
    from = format(startOfWeek(lastWeek), "yyyy-MM-dd");
    to = format(endOfWeek(lastWeek), "yyyy-MM-dd");
  } else if (datePreset === "this-month") {
    from = format(startOfMonth(now), "yyyy-MM-dd");
    to = format(endOfMonth(now), "yyyy-MM-dd");
  } else if (datePreset === "last-month") {
    const lastMonth = subMonths(now, 1);
    from = format(startOfMonth(lastMonth), "yyyy-MM-dd");
    to = format(endOfMonth(lastMonth), "yyyy-MM-dd");
  }

  const { data: summary, isLoading: isGenerating, isFetching } = useGetMileageSummary(
    { device_id: deviceId, from, to },
    { 
      query: { 
        enabled: !!deviceId && !!from && !!to && submitted,
        queryKey: getGetMileageSummaryQueryKey({ device_id: deviceId, from, to })
      } 
    }
  );

  const handleGenerate = () => {
    if (deviceId && from && to) {
      setSubmitted(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    if (!summary || !summary.daily_logs.length) return;
    
    const headers = ["Date", "Start Odometer", "End Odometer", "Miles Driven"];
    const rows = summary.daily_logs.map(log => [
      log.date,
      log.start_odometer_miles.toFixed(1),
      log.end_odometer_miles.toFixed(1),
      log.miles_driven.toFixed(1)
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mileage-log-${summary.display_name.replace(/ /g, '-')}-${from}-to-${to}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-background text-foreground dark pb-20">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Truck className="h-6 w-6" />
            <h1 className="font-bold text-lg tracking-tight text-foreground">FleetLog</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-background/50 border-border/60 text-muted-foreground font-mono">v1.2.0</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl px-4 mt-8 space-y-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Mileage Report Generator</h2>
            <p className="text-muted-foreground mt-1">Select a vehicle and date range to compile daily odometer logs.</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-sm bg-card/50 print:hidden">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              <div className="space-y-2">
                <Label htmlFor="truck-select" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Vehicle
                </Label>
                <Select value={deviceId} onValueChange={(val) => { setDeviceId(val); setSubmitted(false); }} disabled={isLoadingDevices}>
                  <SelectTrigger id="truck-select" data-testid="select-truck" className="h-10 bg-background/50">
                    <SelectValue placeholder={isLoadingDevices ? "Loading fleet..." : "Select a truck"} />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(device => (
                      <SelectItem key={device.device_id} value={device.device_id} data-testid={`option-truck-${device.device_id}`}>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${device.active_state === 'active' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                          {device.display_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-preset" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Date Range
                </Label>
                <Select value={datePreset} onValueChange={(val: DateRangePreset) => { setDatePreset(val); setSubmitted(false); }}>
                  <SelectTrigger id="date-preset" data-testid="select-date-preset" className="h-10 bg-background/50">
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-week" data-testid="option-preset-this-week">This Week</SelectItem>
                    <SelectItem value="last-week" data-testid="option-preset-last-week">Last Week</SelectItem>
                    <SelectItem value="this-month" data-testid="option-preset-this-month">This Month</SelectItem>
                    <SelectItem value="last-month" data-testid="option-preset-last-month">Last Month</SelectItem>
                    <SelectItem value="custom" data-testid="option-preset-custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {datePreset === "custom" ? (
                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date-from" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
                    <Input 
                      id="date-from" 
                      type="date" 
                      value={customFrom} 
                      onChange={(e) => { setCustomFrom(e.target.value); setSubmitted(false); }} 
                      className="h-10 bg-background/50"
                      data-testid="input-date-from"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-to" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
                    <Input 
                      id="date-to" 
                      type="date" 
                      value={customTo} 
                      onChange={(e) => { setCustomTo(e.target.value); setSubmitted(false); }} 
                      className="h-10 bg-background/50"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
              ) : (
                <div className="col-span-1 md:col-span-1 flex items-center h-10 px-3 border border-dashed border-border rounded-md bg-muted/20 text-sm text-muted-foreground font-mono">
                  {from} <span className="mx-2">to</span> {to}
                </div>
              )}

              <div className="col-span-1 md:col-span-1">
                <Button 
                  onClick={handleGenerate} 
                  disabled={!deviceId || (isGenerating && isFetching)} 
                  className="w-full h-10 font-semibold tracking-wide"
                  data-testid="button-generate"
                >
                  {isGenerating && isFetching ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      Compiling...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Generate Log
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {submitted && (isGenerating && isFetching) && (
          <Card className="border-border/50 bg-card/20 border-dashed">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Crunching telemetry data...</p>
                <p className="text-sm text-muted-foreground">Calculating odometer spans for selected period.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {submitted && !(isGenerating && isFetching) && !summary && (
          <Card className="border-border/50 bg-destructive/5 border-destructive/20">
            <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-3">
              <AlertCircle className="h-8 w-8 text-destructive/80" />
              <p className="font-medium text-destructive">Failed to generate report</p>
              <p className="text-sm text-muted-foreground max-w-sm">There was a problem retrieving data for this vehicle. Please try again or select a different date range.</p>
            </CardContent>
          </Card>
        )}

        {submitted && summary && (
          <Card className="border-border/50 shadow-md overflow-hidden bg-card/80 backdrop-blur" data-testid="card-report-results">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-6 print:border-none print:bg-transparent">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-xl flex items-center gap-2">
                    {summary.display_name}
                    <Badge variant="secondary" className="font-mono text-xs font-normal bg-primary/10 text-primary hover:bg-primary/20">{summary.device_id}</Badge>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5 font-mono text-xs">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {summary.from} &mdash; {summary.to}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print" className="h-8 bg-background border-border/60 hover:bg-muted hover:text-foreground transition-colors">
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                  <Button variant="default" size="sm" onClick={handleExportCSV} data-testid="button-export" className="h-8">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {summary.daily_logs.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-center space-y-3" data-testid="empty-state">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-2">
                    <MapPin className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-lg">No movement logged</p>
                  <p className="text-sm text-muted-foreground">This vehicle did not register any GPS or odometer changes during the selected period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead className="w-[180px] font-semibold text-xs uppercase tracking-wider text-muted-foreground h-11">Date</TableHead>
                        <TableHead className="text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground h-11">Start Odometer</TableHead>
                        <TableHead className="text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground h-11">End Odometer</TableHead>
                        <TableHead className="text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground h-11">Miles Driven</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.daily_logs.map((log, i) => (
                        <TableRow key={log.date} className="border-border/20 transition-colors hover:bg-muted/20 data-[state=selected]:bg-muted" data-testid={`row-log-${i}`}>
                          <TableCell className="font-medium font-mono text-sm">{log.date}</TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{log.start_odometer_miles.toFixed(1)} <span className="text-xs text-muted-foreground/50">mi</span></TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">{log.end_odometer_miles.toFixed(1)} <span className="text-xs text-muted-foreground/50">mi</span></TableCell>
                          <TableCell className="text-right font-mono text-primary font-semibold">
                            {log.miles_driven > 0 ? '+' : ''}{log.miles_driven.toFixed(1)} <span className="text-xs opacity-50">mi</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {summary.daily_logs.length > 0 && (
              <CardFooter className="bg-muted/20 border-t border-border/40 p-4 md:px-6 flex justify-between items-center print:border-t-2 print:border-black">
                <span className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Period Total</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono tracking-tight text-foreground" data-testid="text-total-miles">
                    {summary.total_miles.toFixed(1)}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">miles</span>
                </div>
              </CardFooter>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
