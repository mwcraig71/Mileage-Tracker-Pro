import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db";
import { verifyManagerToken } from "../managerToken";
import { parseBody } from "../lib/validate";

const router = Router();

const annotationInputSchema = z.object({
  period_id: z.number(),
  device_id: z.string(),
  device_name: z.string().optional().default(""),
  date: z.string(),
  split_index: z.number().optional().default(0),
  begin_odometer: z.number().optional(),
  end_odometer: z.number().optional(),
  gps_miles: z.number().optional(),
  indirect_miles: z.number().optional().default(0),
  personal_miles: z.number().optional().default(0),
  direct_miles: z.number().optional().default(0),
  project_number: z.string().optional().default(""),
  team_leader_name: z.string().optional().default(""),
  manager_token: z.string().optional(),
});

const annotationUpdateSchema = z.object({
  indirect_miles: z.number().optional(),
  personal_miles: z.number().optional(),
  direct_miles: z.number().optional(),
  project_number: z.string().optional(),
  team_leader_name: z.string().optional(),
  manager_token: z.string().optional(),
});

function fmtAnnotation(r: Record<string, unknown>) {
  return {
    id: r.id,
    period_id: r.period_id,
    device_id: r.device_id,
    device_name: r.device_name,
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    split_index: Number(r.split_index ?? 0),
    begin_odometer: r.begin_odometer != null ? Number(r.begin_odometer) : null,
    end_odometer: r.end_odometer != null ? Number(r.end_odometer) : null,
    gps_miles: r.gps_miles != null ? Number(r.gps_miles) : null,
    indirect_miles: Number(r.indirect_miles),
    personal_miles: Number(r.personal_miles),
    direct_miles: Number(r.direct_miles),
    project_number: r.project_number,
    team_leader_name: r.team_leader_name,
    is_exported: Boolean(r.is_exported),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// Upsert annotation (by period_id + device_id + date)
// Rejects writes to finalized periods unless a valid manager_token is provided.
router.post("/", async (req, res) => {
  const body = parseBody(annotationInputSchema, req.body, res);
  if (!body) return;
  const {
    period_id, device_id, device_name, date,
    split_index,
    begin_odometer, end_odometer, gps_miles,
    indirect_miles, personal_miles, direct_miles,
    project_number, team_leader_name,
    manager_token,
  } = body;

  const periodResult = await pool.query(
    "SELECT finalized FROM periods WHERE id = $1",
    [period_id]
  );
  if (periodResult.rows.length === 0) {
    res.status(404).json({ error: "Period not found" });
    return;
  }
  if (periodResult.rows[0].finalized === true) {
    if (!verifyManagerToken(manager_token, Number(period_id))) {
      res.status(403).json({
        error: "This period is finalized. A valid manager unlock token is required to make changes.",
      });
      return;
    }
  }

  const result = await pool.query(
    `INSERT INTO log_annotations
      (period_id, device_id, device_name, date, split_index,
       begin_odometer, end_odometer, gps_miles,
       indirect_miles, personal_miles, direct_miles, project_number, team_leader_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (period_id, device_id, date, split_index) DO UPDATE SET
       device_name = EXCLUDED.device_name,
       begin_odometer = COALESCE(EXCLUDED.begin_odometer, log_annotations.begin_odometer),
       end_odometer = COALESCE(EXCLUDED.end_odometer, log_annotations.end_odometer),
       gps_miles = COALESCE(EXCLUDED.gps_miles, log_annotations.gps_miles),
       indirect_miles = EXCLUDED.indirect_miles,
       personal_miles = EXCLUDED.personal_miles,
       direct_miles = EXCLUDED.direct_miles,
       project_number = EXCLUDED.project_number,
       team_leader_name = EXCLUDED.team_leader_name,
       updated_at = NOW()
     RETURNING *`,
    [period_id, device_id, device_name, date, split_index,
     begin_odometer ?? null, end_odometer ?? null, gps_miles ?? null,
     indirect_miles, personal_miles, direct_miles, project_number, team_leader_name]
  );
  res.status(201).json(fmtAnnotation(result.rows[0]));
});

// Delete a single annotation record (used to remove a saved split row).
router.delete("/:id", async (req, res) => {
  const result = await pool.query(
    "DELETE FROM log_annotations WHERE id = $1 RETURNING id",
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Annotation not found" });
    return;
  }
  res.status(204).send();
});

// Update a single annotation.
// Rejects writes to finalized periods unless a valid manager_token is provided.
router.put("/:id", async (req, res) => {
  const body = parseBody(annotationUpdateSchema, req.body, res);
  if (!body) return;
  const {
    indirect_miles, personal_miles, direct_miles,
    project_number, team_leader_name,
    manager_token,
  } = body;

  // Resolve this annotation's period to check finalized status
  const annResult = await pool.query(
    "SELECT period_id FROM log_annotations WHERE id = $1",
    [req.params.id]
  );
  if (annResult.rows.length === 0) {
    res.status(404).json({ error: "Annotation not found" });
    return;
  }
  const periodId = Number(annResult.rows[0].period_id);

  const periodResult = await pool.query(
    "SELECT finalized FROM periods WHERE id = $1",
    [periodId]
  );
  if (periodResult.rows[0]?.finalized === true) {
    if (!verifyManagerToken(manager_token, periodId)) {
      res.status(403).json({
        error: "This period is finalized. A valid manager unlock token is required to make changes.",
      });
      return;
    }
  }

  const result = await pool.query(
    `UPDATE log_annotations SET
       indirect_miles = COALESCE($2, indirect_miles),
       personal_miles = COALESCE($3, personal_miles),
       direct_miles = COALESCE($4, direct_miles),
       project_number = COALESCE($5, project_number),
       team_leader_name = COALESCE($6, team_leader_name),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [req.params.id,
     indirect_miles ?? null, personal_miles ?? null, direct_miles ?? null,
     project_number ?? null, team_leader_name ?? null]
  );
  res.json(fmtAnnotation(result.rows[0]));
});

export default router;
