import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db";
import { parseBody } from "../lib/validate";

const router = Router();

const projectSchema = z.object({
  project_number: z.string(),
});

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM projects ORDER BY project_number ASC");
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const body = parseBody(projectSchema, req.body, res);
  if (!body) return;
  const { project_number } = body;
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
  await pool.query("DELETE FROM project_states WHERE project_number = $1", [project_number]);
  await pool.query("DELETE FROM projects WHERE project_number = $1", [project_number]);
  res.status(204).send();
});

export default router;
