import { Router } from "express";
import { z } from "zod";
import { pool } from "../lib/db";
import { parseBody } from "../lib/validate";

const router = Router();

const teamLeaderSchema = z.object({
  name: z.string(),
});

router.get("/", async (_req, res) => {
  const result = await pool.query("SELECT * FROM team_leaders ORDER BY name ASC");
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const body = parseBody(teamLeaderSchema, req.body, res);
  if (!body) return;
  const { name } = body;
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
