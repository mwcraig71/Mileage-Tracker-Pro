import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db";
import { parseBody } from "../lib/validate";

const router = Router();

const logEntrySchema = z.object({
  device_id: z.string(),
  device_name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  begin_odometer: z.number(),
  end_odometer: z.number(),
  indirect_miles: z.number().optional().default(0),
  personal_miles: z.number().optional().default(0),
  direct_miles: z.number().optional().default(0),
  project_number: z.string(),
  team_leader_name: z.string(),
});

router.get("/", async (_req, res) => {
  const result = await pool.query(`
    SELECT * FROM log_entries ORDER BY start_date ASC, created_at ASC
  `);
  res.json(result.rows.map(r => ({
    id: r.id,
    device_id: r.device_id,
    device_name: r.device_name,
    start_date: r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date).slice(0, 10),
    end_date: r.end_date instanceof Date ? r.end_date.toISOString().slice(0, 10) : String(r.end_date).slice(0, 10),
    begin_odometer: Number(r.begin_odometer),
    end_odometer: Number(r.end_odometer),
    indirect_miles: Number(r.indirect_miles),
    personal_miles: Number(r.personal_miles),
    direct_miles: Number(r.direct_miles),
    total_miles: Number(r.total_miles),
    project_number: r.project_number,
    team_leader_name: r.team_leader_name,
    created_at: r.created_at,
  })));
});

router.post("/", async (req, res) => {
  const body = parseBody(logEntrySchema, req.body, res);
  if (!body) return;
  const {
    device_id, device_name, start_date, end_date,
    begin_odometer, end_odometer,
    indirect_miles, personal_miles, direct_miles,
    project_number, team_leader_name,
  } = body;

  const total_miles = Number(indirect_miles) + Number(personal_miles) + Number(direct_miles);

  const result = await pool.query(
    `INSERT INTO log_entries
      (device_id, device_name, start_date, end_date, begin_odometer, end_odometer,
       indirect_miles, personal_miles, direct_miles, total_miles, project_number, team_leader_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [device_id, device_name, start_date, end_date, begin_odometer, end_odometer,
     indirect_miles, personal_miles, direct_miles, total_miles, project_number, team_leader_name]
  );

  const r = result.rows[0];
  res.status(201).json({
    id: r.id,
    device_id: r.device_id,
    device_name: r.device_name,
    start_date: r.start_date instanceof Date ? r.start_date.toISOString().slice(0, 10) : String(r.start_date).slice(0, 10),
    end_date: r.end_date instanceof Date ? r.end_date.toISOString().slice(0, 10) : String(r.end_date).slice(0, 10),
    begin_odometer: Number(r.begin_odometer),
    end_odometer: Number(r.end_odometer),
    indirect_miles: Number(r.indirect_miles),
    personal_miles: Number(r.personal_miles),
    direct_miles: Number(r.direct_miles),
    total_miles: Number(r.total_miles),
    project_number: r.project_number,
    team_leader_name: r.team_leader_name,
    created_at: r.created_at,
  });
});

router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM log_entries WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

export default router;
