import { Router } from "express";
import { pool } from "../lib/db";

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
    // Replace-list semantics, but delete only rows absent from the payload —
    // a malformed/partial payload can no longer silently wipe the table.
    const keepIds = items.map((i) => i.device_id).filter(Boolean);
    if (keepIds.length > 0) {
      await client.query(
        "DELETE FROM truck_states WHERE device_id <> ALL($1::text[])",
        [keepIds]
      );
    } else {
      await client.query("DELETE FROM truck_states");
    }
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

// Add a manually-registered truck (device_id prefix: "manual-")
router.post("/trucks", async (req, res) => {
  const { display_name } = req.body as { display_name?: string };
  if (!display_name?.trim()) {
    res.status(400).json({ error: "display_name is required" });
    return;
  }
  const device_id = `manual-${Date.now()}`;
  await pool.query(
    `INSERT INTO truck_states (device_id, device_name, state_code)
     VALUES ($1, $2, '')
     ON CONFLICT (device_id) DO NOTHING`,
    [device_id, display_name.trim()]
  );
  res.status(201).json({ device_id, device_name: display_name.trim(), state_code: "" });
});

// Delete a truck's state record (any truck)
router.delete("/trucks/:device_id", async (req, res) => {
  const { device_id } = req.params;
  await pool.query("DELETE FROM truck_states WHERE device_id = $1", [device_id]);
  res.status(204).end();
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
    // Same targeted-delete approach as truck-states above.
    const keepNums = items.map((i) => i.project_number).filter(Boolean);
    if (keepNums.length > 0) {
      await client.query(
        "DELETE FROM project_states WHERE project_number <> ALL($1::text[])",
        [keepNums]
      );
    } else {
      await client.query("DELETE FROM project_states");
    }
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
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await pool.query("DELETE FROM state_contacts WHERE id = $1", [id]);
  res.status(204).end();
});

// ── Alert schedule config ────────────────────────────────────────────────────

router.get("/alert-config", async (_req, res) => {
  const result = await pool.query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'check_time'`
  );
  const check_time = result.rows[0]?.value ?? "10:00";
  res.json({ check_time });
});

router.put("/alert-config", async (req, res) => {
  const { check_time } = req.body as { check_time?: string };
  if (typeof check_time !== "string" || !/^\d{1,2}:\d{2}$/.test(check_time)) {
    res.status(400).json({ error: "check_time must be HH:MM format" });
    return;
  }
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('check_time', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [check_time]
  );
  const { updateSchedulerTime } = await import("../scheduler");
  await updateSchedulerTime(check_time);
  res.json({ check_time });
});

export default router;
