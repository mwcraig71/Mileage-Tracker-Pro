import { Router } from "express";
import { pool } from "../lib/db";
import { toDateOnly } from "../lib/dates";

const router = Router();

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

function fmtAnnotation(r: Record<string, unknown>) {
  return {
    id: r.id,
    period_id: r.period_id,
    device_id: r.device_id,
    device_name: r.device_name,
    date: toDateOnly(r.date),
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
  const { month_key } = req.body as { month_key: string };
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
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await pool.query(
    "SELECT * FROM log_annotations WHERE period_id = $1 ORDER BY date ASC, device_id ASC",
    [id]
  );
  res.json(result.rows.map(fmtAnnotation));
});

// Finalize a period
router.post("/:id/finalize", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await pool.query(
    `UPDATE periods SET finalized = TRUE, finalized_at = NOW()
     WHERE id = $1 AND finalized = FALSE RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Period not found or already finalized" });
    return;
  }
  res.json(result.rows[0]);
});

// Mark annotations as exported
router.post("/:id/mark-exported", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { annotation_ids } = req.body as { annotation_ids: number[] };
  if (
    !Array.isArray(annotation_ids) ||
    annotation_ids.length === 0 ||
    !annotation_ids.every((n) => Number.isInteger(n))
  ) {
    res.status(400).json({ error: "annotation_ids must be a non-empty array of integers" });
    return;
  }
  const result = await pool.query(
    `UPDATE log_annotations SET is_exported = TRUE, updated_at = NOW()
     WHERE period_id = $1 AND id = ANY($2::int[])`,
    [id, annotation_ids]
  );
  res.json({ updated: result.rowCount ?? 0 });
});

export default router;
