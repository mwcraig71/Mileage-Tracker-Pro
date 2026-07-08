import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db";
import { parseBody } from "../lib/validate";

const router = Router();

const createPeriodSchema = z.object({
  month_key: z.string(),
});

const markExportedSchema = z.object({
  annotation_ids: z.array(z.number()),
});

function fmtDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function fmtAnnotation(r: Record<string, unknown>) {
  return {
    id: r.id,
    period_id: r.period_id,
    device_id: r.device_id,
    device_name: r.device_name,
    date: fmtDate(r.date),
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

// List all periods
router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM periods ORDER BY month_key DESC");
  res.json(result.rows);
});

// Get or create a period by month_key (e.g. "2026-05")
router.post("/", async (req, res) => {
  const body = parseBody(createPeriodSchema, req.body, res);
  if (!body) return;
  const { month_key } = body;
  if (!month_key?.match(/^\d{4}-\d{2}$/)) {
    res.status(400).json({ error: "month_key must be YYYY-MM" });
    return;
  }
  const [year, month] = month_key.split("-").map(Number);
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const result = await pool.query(
    `INSERT INTO periods (label, month_key) VALUES ($1, $2)
     ON CONFLICT (month_key) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [monthName, month_key]
  );
  res.status(201).json(result.rows[0]);
});

// Get annotations for a period
router.get("/:id/annotations", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM log_annotations WHERE period_id = $1 ORDER BY date ASC, device_id ASC",
    [req.params.id]
  );
  res.json(result.rows.map(fmtAnnotation));
});

// Finalize a period
router.post("/:id/finalize", async (req, res) => {
  const result = await pool.query(
    `UPDATE periods SET finalized = TRUE, finalized_at = NOW()
     WHERE id = $1 AND finalized = FALSE RETURNING *`,
    [req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Period not found or already finalized" });
    return;
  }
  res.json(result.rows[0]);
});

// Mark annotations as exported
router.post("/:id/mark-exported", async (req, res) => {
  const body = parseBody(markExportedSchema, req.body, res);
  if (!body) return;
  const { annotation_ids } = body;
  if (annotation_ids.length === 0) {
    res.status(400).json({ error: "annotation_ids is required" });
    return;
  }
  await pool.query(
    `UPDATE log_annotations SET is_exported = TRUE, updated_at = NOW()
     WHERE period_id = $1 AND id = ANY($2::int[])`,
    [req.params.id, annotation_ids]
  );
  res.json({ updated: annotation_ids.length });
});

export default router;
