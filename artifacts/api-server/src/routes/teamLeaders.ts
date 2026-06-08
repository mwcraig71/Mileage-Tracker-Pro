import { Router } from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const router = Router();

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM team_leaders ORDER BY name ASC");
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const result = await pool.query(
    "INSERT INTO team_leaders (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *",
    [name.trim()]
  );
  res.status(201).json(result.rows[0]);
});

export default router;
