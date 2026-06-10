import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get("/", async (req, res) => {
  try {
    const { from, to, project, leader } = req.query as {
      from?: string; to?: string; project?: string; leader?: string;
    };

    if (!from || !to) {
      res.status(400).json({ error: "from and to are required" });
      return;
    }

    const rawIds = req.query["device_ids[]"] ?? req.query["device_ids"];
    const device_ids = rawIds ? [rawIds].flat().filter(Boolean) as string[] : [];

    const params: unknown[] = [from, to];

    let laDeviceFilter = "";
    let gcDeviceFilter = "";

    if (device_ids.length > 0) {
      params.push(device_ids);
      laDeviceFilter = `AND la.device_id = ANY($${params.length}::text[])`;
      gcDeviceFilter = `AND gc.device_id = ANY($${params.length}::text[])`;
    }

    let projectFilter = "";
    let leaderFilter  = "";

    if (project) {
      params.push(project);
      projectFilter = `AND la.project_number = $${params.length}`;
    }

    if (leader) {
      params.push(leader);
      leaderFilter = `AND la.team_leader_name = $${params.length}`;
    }

    // Part 1: annotated rows from log_annotations (primary source)
    // Includes annotation_id and period_id so the frontend can edit/split rows.
    const part1 = `
      SELECT
        la.device_id,
        la.device_name,
        la.date::TEXT                                                          AS date,
        CASE WHEN la.split_index = 0 THEN la.begin_odometer ELSE NULL END      AS begin_odometer,
        CASE WHEN la.split_index = 0 THEN la.end_odometer   ELSE NULL END      AS end_odometer,
        CASE WHEN la.split_index = 0 THEN la.gps_miles
             ELSE (la.indirect_miles + la.personal_miles + la.direct_miles)
        END                                                                    AS gps_miles,
        la.indirect_miles,
        la.personal_miles,
        la.direct_miles,
        la.project_number,
        la.team_leader_name,
        la.is_exported,
        la.split_index,
        la.id                                                                  AS annotation_id,
        la.period_id
      FROM log_annotations la
      WHERE la.date >= $1 AND la.date <= $2
        ${laDeviceFilter}
        ${projectFilter}
        ${leaderFilter}
    `;

    // Part 2: GPS-only rows from gps_cache (no annotation saved yet)
    // Only include when no project/leader filter is active.
    const includePart2 = !project && !leader;
    const part2 = `
      SELECT
        gc.device_id,
        gc.device_name,
        gc.date::TEXT  AS date,
        gc.begin_odometer,
        gc.end_odometer,
        gc.gps_miles,
        0              AS indirect_miles,
        0              AS personal_miles,
        gc.gps_miles   AS direct_miles,
        ''             AS project_number,
        ''             AS team_leader_name,
        false          AS is_exported,
        0              AS split_index,
        NULL           AS annotation_id,
        NULL           AS period_id
      FROM gps_cache gc
      WHERE gc.date >= $1 AND gc.date <= $2
        ${gcDeviceFilter}
        AND NOT EXISTS (
          SELECT 1 FROM log_annotations la2
          WHERE la2.device_id = gc.device_id AND la2.date = gc.date
        )
    `;

    const query = includePart2
      ? `${part1} UNION ALL ${part2} ORDER BY date, device_name, split_index`
      : `${part1} ORDER BY date, device_name, split_index`;

    const result = await pool.query(query, params);
    res.json(result.rows.map(r => ({
      device_id:        r.device_id,
      device_name:      r.device_name,
      date:             r.date,
      begin_odometer:   r.begin_odometer  != null ? parseFloat(r.begin_odometer)  : null,
      end_odometer:     r.end_odometer    != null ? parseFloat(r.end_odometer)    : null,
      gps_miles:        r.gps_miles       != null ? parseFloat(r.gps_miles)       : null,
      indirect_miles:   parseFloat(r.indirect_miles)  || 0,
      personal_miles:   parseFloat(r.personal_miles)  || 0,
      direct_miles:     parseFloat(r.direct_miles)    || 0,
      project_number:   r.project_number,
      team_leader_name: r.team_leader_name,
      is_exported:      r.is_exported,
      split_index:      parseInt(r.split_index),
      annotation_id:    r.annotation_id != null ? parseInt(r.annotation_id) : null,
      period_id:        r.period_id      != null ? parseInt(r.period_id)     : null,
    })));
  } catch (err) {
    console.error("Reports query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
