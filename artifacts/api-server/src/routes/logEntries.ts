import { Router } from "express";
import { pool } from "../lib/db";
import { toDateOnly } from "../lib/dates";

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fmtLogEntry(r: Record<string, any>) {
  return {
    id: r.id,
    device_id: r.device_id,
    device_name: r.device_name,
    start_date: toDateOnly(r.start_date),
    end_date: toDateOnly(r.end_date),
    begin_odometer: Number(r.begin_odometer),
    end_odometer: Number(r.end_odometer),
    indirect_miles: Number(r.indirect_miles),
    personal_miles: Number(r.personal_miles),
    direct_miles: Number(r.direct_miles),
    total_miles: Number(r.total_miles),
    project_number: r.project_number,
    team_leader_name: r.team_leader_name,
    created_at: r.created_at,
  };
}

router.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT * FROM log_entries ORDER BY start_date ASC, created_at ASC
  `);
  res.json(result.rows.map(fmtLogEntry));
});

router.post("/", async (req, res) => {
  const {
    device_id, device_name, start_date, end_date,
    begin_odometer, end_odometer,
    indirect_miles = 0, personal_miles = 0, direct_miles = 0,
    project_number, team_leader_name,
  } = req.body as {
    device_id?: string; device_name?: string;
    start_date?: string; end_date?: string;
    begin_odometer?: number; end_odometer?: number;
    indirect_miles?: number; personal_miles?: number; direct_miles?: number;
    project_number?: string; team_leader_name?: string;
  };

  // Validate required fields before touching the DB.
  if (!device_id?.trim() || !device_name?.trim()) {
    res.status(400).json({ error: "device_id and device_name are required" });
    return;
  }
  if (!start_date || !DATE_RE.test(start_date) || !end_date || !DATE_RE.test(end_date)) {
    res.status(400).json({ error: "start_date and end_date must be YYYY-MM-DD" });
    return;
  }
  const nums = { begin_odometer, end_odometer, indirect_miles, personal_miles, direct_miles };
  for (const [key, val] of Object.entries(nums)) {
    if (typeof val !== "number" || !Number.isFinite(val)) {
      res.status(400).json({ error: `${key} must be a number` });
      return;
    }
  }

  const total_miles = Number(indirect_miles) + Number(personal_miles) + Number(direct_miles);

  const result = await pool.query(
    `INSERT INTO log_entries
      (device_id, device_name, start_date, end_date, begin_odometer, end_odometer,
       indirect_miles, personal_miles, direct_miles, total_miles, project_number, team_leader_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [device_id.trim(), device_name.trim(), start_date, end_date, begin_odometer, end_odometer,
     indirect_miles, personal_miles, direct_miles, total_miles,
     project_number ?? "", team_leader_name ?? ""]
  );

  res.status(201).json(fmtLogEntry(result.rows[0]));
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await pool.query("DELETE FROM log_entries WHERE id = $1", [id]);
  res.status(204).end();
});

export default router;
