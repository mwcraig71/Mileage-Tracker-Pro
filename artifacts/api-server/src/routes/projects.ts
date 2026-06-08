import { Router } from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

export default router;
