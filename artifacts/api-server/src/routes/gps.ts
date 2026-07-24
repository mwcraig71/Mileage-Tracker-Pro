import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

const BASE_URL = "https://track.onestepgps.com/v3/api/public";

function getApiKey(): string {
  const key = process.env.ONESTEP_GPS_API_KEY;
  if (!key) {
    throw new Error("ONESTEP_GPS_API_KEY environment variable is not set");
  }
  return key;
}

/** Build a device-point URL with all query values percent-encoded. */
function devicePointUrl(apiKey: string, params: Record<string, string>): string {
  const qs = new URLSearchParams({ "api-key": apiKey, ...params });
  return `${BASE_URL}/device-point?${qs.toString()}`;
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
    const url = devicePointUrl(apiKey, {
      device_id,
      dt_server_from: from,
      dt_server_to: to,
      limit: "1000",
      sort: "dt_tracker,asc",
    });
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

    const url = devicePointUrl(apiKey, {
      device_id,
      dt_server_from: dtFrom.toISOString(),
      dt_server_to: dtTo.toISOString(),
      limit: "5000",
    });
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

// POST /gps/cache/sync — fetch from One-Step GPS API and persist in gps_cache
router.post("/cache/sync", async (req, res) => {
  const { device_ids, from, to, force = false } = req.body as {
    device_ids: string[];
    from: string;
    to: string;
    force?: boolean;
  };

  if (!Array.isArray(device_ids) || !device_ids.length || !from || !to) {
    res.status(400).json({ error: "device_ids, from, and to are required" });
    return;
  }

  try {
    const apiKey = getApiKey();

    // Fetch device display names once for the whole batch
    const devResponse = await fetch(`${BASE_URL}/device?api-key=${apiKey}`);
    const devData = await devResponse.json() as { result_list: unknown[] };
    const deviceMap = new Map<string, string>(
      (devData.result_list as any[]).map(d => [d.device_id, d.display_name ?? d.device_id]),
    );

    const synced: string[] = [];
    const skipped: string[] = [];

    for (const device_id of device_ids) {
      if (!force) {
        const existing = await pool.query(
          `SELECT COUNT(*) AS cnt FROM gps_cache WHERE device_id = $1 AND date >= $2 AND date <= $3`,
          [device_id, from, to],
        );
        if (parseInt(existing.rows[0].cnt) > 0) {
          skipped.push(device_id);
          continue;
        }
      }

      const displayName = deviceMap.get(device_id) ?? device_id;
      const dtFrom = new Date(from);
      dtFrom.setHours(0, 0, 0, 0);
      const dtTo = new Date(to);
      dtTo.setHours(23, 59, 59, 999);

      const url = devicePointUrl(apiKey, {
        device_id,
        dt_server_from: dtFrom.toISOString(),
        dt_server_to: dtTo.toISOString(),
        limit: "5000",
      });
      const ptResponse = await fetch(url);
      if (!ptResponse.ok) continue;

      const ptData = await ptResponse.json() as { result_list: unknown[] };
      const sortedPoints = ((ptData.result_list || []) as any[])
        .slice()
        .sort((a, b) => (a.dt_tracker || "").localeCompare(b.dt_tracker || ""));

      const byDate: Record<string, { first: number; last: number }> = {};
      for (const p of sortedPoints) {
        const odoMeters = p.device_point_detail?.vbus_odometer?.value;
        if (odoMeters == null || odoMeters === 0) continue;
        const date = (p.dt_tracker || "").substring(0, 10);
        if (!date) continue;
        if (!byDate[date]) byDate[date] = { first: odoMeters, last: odoMeters };
        else byDate[date].last = odoMeters;
      }

      for (const [date, { first, last }] of Object.entries(byDate)) {
        await pool.query(
          `INSERT INTO gps_cache (device_id, device_name, date, begin_odometer, end_odometer, gps_miles)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (device_id, date) DO UPDATE SET
             device_name    = EXCLUDED.device_name,
             begin_odometer = EXCLUDED.begin_odometer,
             end_odometer   = EXCLUDED.end_odometer,
             gps_miles      = EXCLUDED.gps_miles,
             fetched_at     = NOW()`,
          [device_id, displayName, date, metersToMiles(first), metersToMiles(last),
           Math.max(0, metersToMiles(last - first))],
        );
      }
      synced.push(device_id);
    }

    res.json({ synced, skipped });
  } catch (err) {
    console.error("GPS cache sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /gps/cache — query persisted GPS data
router.get("/cache", async (req, res) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      res.status(400).json({ error: "from and to are required" });
      return;
    }

    const rawIds = req.query["device_ids[]"] ?? req.query["device_ids"];
    const device_ids = rawIds ? [rawIds].flat().filter(Boolean) as string[] : [];

    const params: unknown[] = [from, to];
    let deviceFilter = "";
    if (device_ids.length > 0) {
      params.push(device_ids);
      deviceFilter = `AND device_id = ANY($${params.length}::text[])`;
    }

    const result = await pool.query(
      `SELECT device_id, device_name, date::TEXT AS date,
              begin_odometer, end_odometer, gps_miles, fetched_at
       FROM gps_cache
       WHERE date >= $1 AND date <= $2 ${deviceFilter}
       ORDER BY date, device_name`,
      params,
    );

    res.json(result.rows.map(r => ({
      device_id:      r.device_id,
      device_name:    r.device_name,
      date:           r.date,
      begin_odometer: parseFloat(r.begin_odometer),
      end_odometer:   parseFloat(r.end_odometer),
      gps_miles:      parseFloat(r.gps_miles),
      fetched_at:     r.fetched_at,
    })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/odometer-range", async (req, res) => {
  try {
    const { device_id, from, to } = req.query as { device_id?: string; from?: string; to?: string };
    if (!device_id || !from || !to) {
      res.status(400).json({ error: "device_id, from, and to are required" });
      return;
    }
    const apiKey = getApiKey();
    const dtFrom = new Date(from);
    dtFrom.setHours(0, 0, 0, 0);
    const dtTo = new Date(to);
    dtTo.setHours(23, 59, 59, 999);

    const url = devicePointUrl(apiKey, {
      device_id,
      dt_server_from: dtFrom.toISOString(),
      dt_server_to: dtTo.toISOString(),
      limit: "5000",
    });
    const ptResponse = await fetch(url);
    if (!ptResponse.ok) {
      res.status(502).json({ error: "Failed to fetch device points" });
      return;
    }
    const ptData = await ptResponse.json() as { result_list: unknown[] };
    const points = (ptData.result_list || []) as any[];

    const sorted = points.slice().sort((a, b) =>
      (a.dt_tracker || "").localeCompare(b.dt_tracker || "")
    );

    let firstOdo: number | null = null;
    let lastOdo: number | null = null;
    for (const p of sorted) {
      const odo = p.device_point_detail?.vbus_odometer?.value;
      if (odo == null || odo === 0) continue;
      if (firstOdo === null) firstOdo = odo;
      lastOdo = odo;
    }

    const begin = firstOdo != null ? metersToMiles(firstOdo) : 0;
    const end = lastOdo != null ? metersToMiles(lastOdo) : 0;

    res.json({
      device_id,
      from,
      to,
      begin_odometer_miles: begin,
      end_odometer_miles: end,
      total_miles: Math.max(0, Math.round((end - begin) * 10) / 10),
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
