import { Router } from "express";
import { pool } from "../lib/db";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM projects ORDER BY project_number ASC");
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { project_number } = req.body as { project_number: string };
  if (!project_number?.trim()) {
    res.status(400).json({ error: "project_number is required" });
    return;
  }
  const result = await pool.query(
    "INSERT INTO projects (project_number) VALUES ($1) ON CONFLICT (project_number) DO UPDATE SET project_number = EXCLUDED.project_number RETURNING *",
    [project_number.trim()]
  );
  res.status(201).json(result.rows[0]);
});

router.delete("/:project_number", async (req, res) => {
  const { project_number } = req.params;
  // Both deletes in one transaction so a failure can't leave orphaned state.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM project_states WHERE project_number = $1", [project_number]);
    await client.query("DELETE FROM projects WHERE project_number = $1", [project_number]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.status(204).send();
});

export default router;
