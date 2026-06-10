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
    let deviceFilter = "";
    let projectFilter = "";
    let leaderFilter = "";

    if (device_ids.length > 0) {
      params.push(device_ids);
      deviceFilter = `AND gc.device_id = ANY($${params.length}::text[])`;
    }

    if (project) {
      params.push(project);
      projectFilter = `AND la.project_number = $${params.length}`;
    }

    if (leader) {
      params.push(leader);
      leaderFilter = `AND la.team_leader_name = $${params.length}`;
    }

    const joinType = project || leader ? "INNER" : "LEFT";

    const query = `
      SELECT
        gc.device_id,
        gc.device_name,
        gc.date::TEXT                                                       AS date,
        CASE WHEN COALESCE(la.split_index, 0) = 0 THEN gc.begin_odometer
             ELSE NULL END                                                  AS begin_odometer,
        CASE WHEN COALESCE(la.split_index, 0) = 0 THEN gc.end_odometer
             ELSE NULL END                                                  AS end_odometer,
        CASE WHEN COALESCE(la.split_index, 0) = 0 THEN gc.gps_miles
             ELSE (COALESCE(la.indirect_miles,0) + COALESCE(la.personal_miles,0) + COALESCE(la.direct_miles,0))
        END                                                                 AS gps_miles,
        COALESCE(la.indirect_miles, 0)                                      AS indirect_miles,
        COALESCE(la.personal_miles, 0)                                      AS personal_miles,
        COALESCE(la.direct_miles, gc.gps_miles)                             AS direct_miles,
        COALESCE(la.project_number, '')                                     AS project_number,
        COALESCE(la.team_leader_name, '')                                   AS team_leader_name,
        COALESCE(la.is_exported, false)                                     AS is_exported,
        COALESCE(la.split_index, 0)                                         AS split_index
      FROM gps_cache gc
      ${joinType} JOIN log_annotations la
        ON la.device_id = gc.device_id AND la.date = gc.date
      WHERE gc.date >= $1 AND gc.date <= $2
        ${deviceFilter}
        ${projectFilter}
        ${leaderFilter}
      ORDER BY gc.date, gc.device_name, COALESCE(la.split_index, 0)
    `;

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
    })));
  } catch (err) {
    console.error("Reports query error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
