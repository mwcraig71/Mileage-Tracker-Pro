import { Router } from "express";
import { pool } from "../lib/db";
import { toDateOnly } from "../lib/dates";
import { verifyManagerToken } from "../managerToken";

const router = Router();

function fmtAnnotation(r: Record<string, unknown>) {
  return {
    id: r.id,
    period_id: r.period_id,
    device_id: r.device_id,
    device_name: r.device_name,
    date: toDateOnly(r.date),
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
  const {
    period_id, device_id, device_name = "", date,
    split_index = 0,
    begin_odometer, end_odometer, gps_miles,
    indirect_miles = 0, personal_miles = 0, direct_miles = 0,
    project_number = "", team_leader_name = "",
    manager_token,
  } = req.body as {
    period_id: number; device_id: string; device_name?: string; date: string;
    split_index?: number;
    begin_odometer?: number; end_odometer?: number; gps_miles?: number;
    indirect_miles?: number; personal_miles?: number; direct_miles?: number;
    project_number?: string; team_leader_name?: string;
    manager_token?: string;
  };

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
// Enforces the same finalized-period lock as POST and PUT — previously this
// was the one write path that skipped the manager-token check.
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const annResult = await pool.query(
    "SELECT period_id FROM log_annotations WHERE id = $1",
    [id]
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
    const managerToken =
      (req.body as { manager_token?: string } | undefined)?.manager_token ??
      (typeof req.query.manager_token === "string" ? req.query.manager_token : undefined);
    if (!verifyManagerToken(managerToken, periodId)) {
      res.status(403).json({
        error: "This period is finalized. A valid manager unlock token is required to make changes.",
      });
      return;
    }
  }

  await pool.query("DELETE FROM log_annotations WHERE id = $1", [id]);
  res.status(204).send();
});

// Update a single annotation.
// Rejects writes to finalized periods unless a valid manager_token is provided.
router.put("/:id", async (req, res) => {
  const {
    indirect_miles, personal_miles, direct_miles,
    project_number, team_leader_name,
    manager_token,
  } = req.body as {
    indirect_miles?: number; personal_miles?: number; direct_miles?: number;
    project_number?: string; team_leader_name?: string;
    manager_token?: string;
  };

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
