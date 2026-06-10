import { Router } from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = Router();

// ── Truck States ────────────────────────────────────────────────────────────

router.get("/truck-states", async (_req, res) => {
  const result = await pool.query(
    "SELECT device_id, device_name, state_code FROM truck_states ORDER BY device_name ASC"
  );
  res.json(result.rows);
});

router.put("/truck-states", async (req, res) => {
  const items = req.body as Array<{ device_id: string; device_name?: string; state_code: string }>;
  if (!Array.isArray(items)) {
    res.status(400).json({ error: "Expected array" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM truck_states");
    for (const item of items) {
      if (!item.device_id) continue;
      await client.query(
        `INSERT INTO truck_states (device_id, device_name, state_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id) DO UPDATE
           SET device_name = EXCLUDED.device_name,
               state_code  = EXCLUDED.state_code`,
        [item.device_id, item.device_name ?? "", item.state_code ?? ""]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ── Project States ──────────────────────────────────────────────────────────

router.get("/project-states", async (_req, res) => {
  const result = await pool.query(
    "SELECT project_number, state_code FROM project_states ORDER BY project_number ASC"
  );
  res.json(result.rows);
});

router.put("/project-states", async (req, res) => {
  const items = req.body as Array<{ project_number: string; state_code: string }>;
  if (!Array.isArray(items)) {
    res.status(400).json({ error: "Expected array" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM project_states");
    for (const item of items) {
      if (!item.project_number) continue;
      await client.query(
        `INSERT INTO project_states (project_number, state_code)
         VALUES ($1, $2)
         ON CONFLICT (project_number) DO UPDATE
           SET state_code = EXCLUDED.state_code`,
        [item.project_number, item.state_code ?? ""]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// ── State Contacts ──────────────────────────────────────────────────────────

router.get("/state-contacts", async (_req, res) => {
  const result = await pool.query(
    "SELECT id, state_code, contact_name, email FROM state_contacts ORDER BY state_code ASC, contact_name ASC"
  );
  res.json(result.rows);
});

router.post("/state-contacts", async (req, res) => {
  const { state_code, contact_name, email } = req.body as {
    state_code?: string;
    contact_name?: string;
    email?: string;
  };
  if (!state_code?.trim() || !contact_name?.trim() || !email?.trim()) {
    res.status(400).json({ error: "state_code, contact_name, and email are required" });
    return;
  }
  const result = await pool.query(
    `INSERT INTO state_contacts (state_code, contact_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (state_code, email) DO UPDATE
       SET contact_name = EXCLUDED.contact_name
     RETURNING id, state_code, contact_name, email`,
    [state_code.trim(), contact_name.trim(), email.trim()]
  );
  res.status(201).json(result.rows[0]);
});

router.delete("/state-contacts/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM state_contacts WHERE id = $1", [Number(id)]);
  res.status(204).end();
});

export default router;
