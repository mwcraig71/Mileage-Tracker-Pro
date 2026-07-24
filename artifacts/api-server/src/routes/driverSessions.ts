import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

router.get("/", async (req, res) => {
  const { from, to, device_id } = req.query as {
    from?: string;
    to?: string;
    device_id?: string;
  };

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) {
    params.push(from);
    conditions.push(`started_at::date >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`started_at::date <= $${params.length}::date`);
  }
  if (device_id) {
    params.push(device_id);
    conditions.push(`device_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT * FROM driver_sessions ${where} ORDER BY started_at DESC`,
    params,
  );
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { driver_name, device_id, project_number, shift_date } = req.body as {
    driver_name?: string;
    device_id?: string;
    project_number?: string;
    shift_date?: string; // YYYY-MM-DD — optional, defaults to today
  };

  if (!driver_name?.trim()) {
    res.status(400).json({ error: "driver_name is required" });
    return;
  }
  if (!device_id?.trim()) {
    res.status(400).json({ error: "device_id is required" });
    return;
  }

  // If a past date is provided, use current time-of-day on that date so the
  // session timestamp is realistic while still matching the intended date.
  let startedAt: Date;
  if (shift_date && /^\d{4}-\d{2}-\d{2}$/.test(shift_date)) {
    const now = new Date();
    const [y, m, d] = shift_date.split("-").map(Number);
    startedAt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  } else {
    startedAt = new Date();
  }

  const result = await pool.query(
    `INSERT INTO driver_sessions (driver_name, device_id, project_number, started_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [driver_name.trim(), device_id.trim(), (project_number ?? "").trim() || null, startedAt],
  );
  res.status(201).json(result.rows[0]);
});

router.patch("/:id/end", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }

  const result = await pool.query(
    `UPDATE driver_sessions SET ended_at = NOW()
     WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "session not found or already ended" });
    return;
  }
  res.json(result.rows[0]);
});

export default router;
