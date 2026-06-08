import { Router } from "express";

const router = Router();

const BASE_URL = "https://track.onestepgps.com/v3/api/public";

function getApiKey(): string {
  const key = process.env.ONESTEP_GPS_API_KEY;
  if (!key) {
    throw new Error("ONESTEP_GPS_API_KEY environment variable is not set");
  }
  return key;
}

const METERS_PER_MILE = 1609.344;

function metersToMiles(meters: number): number {
  return Math.round((meters / METERS_PER_MILE) * 10) / 10;
}

router.get("/devices", async (req, res) => {
  try {
    const apiKey = getApiKey();
    const response = await fetch(`${BASE_URL}/device?api-key=${apiKey}`);
    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch devices from One-Step GPS" });
      return;
    }
    const data = await response.json() as { result_list: unknown[] };
    const devices = (data.result_list || []).map((d: any) => ({
      device_id: d.device_id,
      display_name: d.display_name,
      active_state: d.active_state,
    }));
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/device-points", async (req, res) => {
  try {
    const { device_id, from, to } = req.query as { device_id?: string; from?: string; to?: string };
    if (!device_id || !from || !to) {
      res.status(400).json({ error: "device_id, from, and to are required" });
      return;
    }
    const apiKey = getApiKey();
    const url = `${BASE_URL}/device-point?api-key=${apiKey}&device_id=${device_id}&dt_server_from=${from}&dt_server_to=${to}&limit=1000&sort=dt_tracker,asc`;
    const response = await fetch(url);
    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch device points from One-Step GPS" });
      return;
    }
    const data = await response.json() as { result_list: unknown[] };
    const points = (data.result_list || []).map((p: any) => {
      const odoMeters = p.device_point_detail?.vbus_odometer?.value ?? null;
      return {
        device_point_id: p.device_point_id,
        dt_tracker: p.dt_tracker,
        lat: p.lat,
        lng: p.lng,
        odometer_miles: odoMeters != null ? metersToMiles(odoMeters) : null,
      };
    });
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/mileage-summary", async (req, res) => {
  try {
    const { device_id, from, to } = req.query as { device_id?: string; from?: string; to?: string };
    if (!device_id || !from || !to) {
      res.status(400).json({ error: "device_id, from, and to are required" });
      return;
    }

    const apiKey = getApiKey();

    // Fetch device info for display name
    const devResponse = await fetch(`${BASE_URL}/device?api-key=${apiKey}`);
    const devData = await devResponse.json() as { result_list: unknown[] };
    const device = (devData.result_list || []).find((d: any) => d.device_id === device_id) as any;
    const displayName = device?.display_name ?? device_id;

    // Fetch device points for the date range
    const dtFrom = new Date(from);
    dtFrom.setHours(0, 0, 0, 0);
    const dtTo = new Date(to);
    dtTo.setHours(23, 59, 59, 999);

    const url = `${BASE_URL}/device-point?api-key=${apiKey}&device_id=${device_id}&dt_server_from=${dtFrom.toISOString()}&dt_server_to=${dtTo.toISOString()}&limit=5000&sort=dt_tracker,asc`;
    const ptResponse = await fetch(url);
    if (!ptResponse.ok) {
      res.status(502).json({ error: "Failed to fetch device points" });
      return;
    }
    const ptData = await ptResponse.json() as { result_list: unknown[] };
    const points = ptData.result_list || [];

    // Sort points chronologically by dt_tracker
    const sortedPoints = (points as any[]).slice().sort((a, b) => {
      return (a.dt_tracker || "").localeCompare(b.dt_tracker || "");
    });

    // Group by calendar date, keeping first and last odometer reading per day
    const byDate: Record<string, { first: number; last: number }> = {};
    for (const p of sortedPoints) {
      const odoMeters = p.device_point_detail?.vbus_odometer?.value;
      if (odoMeters == null || odoMeters === 0) continue;
      const date = (p.dt_tracker || "").substring(0, 10);
      if (!date) continue;
      if (!byDate[date]) {
        byDate[date] = { first: odoMeters, last: odoMeters };
      } else {
        byDate[date].last = odoMeters;
      }
    }

    const daily_logs = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { first, last }]) => {
        const milesDriven = Math.max(0, metersToMiles(last - first));
        return {
          date,
          start_odometer_miles: metersToMiles(first),
          end_odometer_miles: metersToMiles(last),
          miles_driven: milesDriven,
        };
      });

    const total_miles = Math.round(daily_logs.reduce((sum, d) => sum + d.miles_driven, 0) * 10) / 10;

    res.json({
      device_id,
      display_name: displayName,
      from,
      to,
      total_miles,
      daily_logs,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
