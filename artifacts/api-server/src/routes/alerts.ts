import { Router } from "express";
import { pool } from "../lib/db";
import { runAccountabilityCheck } from "../scheduler";

const router = Router();

// GET /api/alerts — unresolved alerts from the last 7 days
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, alert_date::TEXT AS alert_date, device_id, device_name, issue, dismissed, created_at
       FROM daily_alerts
       WHERE alert_date >= CURRENT_DATE - INTERVAL '7 days'
         AND dismissed = FALSE
       ORDER BY alert_date DESC, device_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/alerts/check — manually trigger the accountability check
router.post("/check", async (_req, res) => {
  try {
    const result = await runAccountabilityCheck();
    res.json(result);
  } catch (err) {
    console.error("Manual alert check failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/alerts/:id/dismiss — dismiss a single alert
router.patch("/:id/dismiss", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await pool.query(
    `UPDATE daily_alerts SET dismissed = TRUE WHERE id = $1 RETURNING id, alert_date::TEXT AS alert_date, device_id, device_name, issue, dismissed, created_at`,
    [id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(result.rows[0]);
});

export default router;
