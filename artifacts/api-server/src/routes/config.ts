import { Router } from "express";
import { generateManagerToken } from "../managerToken";

const router = Router();

/**
 * GET /api/config/manager-password
 * Compatibility alias required by the task spec.
 * Accepts the password in the Authorization header as "Bearer <password>"
 * and returns { valid: boolean } — never exposes the secret.
 * Note: POST /api/config/verify-password is preferred because it also
 * issues a scoped unlock token and avoids query-param credential exposure.
 */
router.get("/manager-password", (req, res) => {
  const managerPassword = process.env.MANAGER_PASSWORD;
  if (!managerPassword) {
    res.status(503).json({ error: "Manager password is not configured on this server. Set the MANAGER_PASSWORD environment secret." });
    return;
  }
  const auth = req.headers.authorization ?? "";
  const password = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  res.json({ valid: password === managerPassword });
});

router.post("/verify-password", (req, res) => {
  const { password, period_id } = req.body as { password?: string; period_id?: number };

  const managerPassword = process.env.MANAGER_PASSWORD;
  if (!managerPassword) {
    res.status(503).json({ error: "Manager password is not configured on this server. Set the MANAGER_PASSWORD environment secret." });
    return;
  }

  if (typeof password !== "string" || password !== managerPassword) {
    res.json({ valid: false, token: null });
    return;
  }

  if (typeof period_id !== "number") {
    res.status(400).json({ error: "period_id is required" });
    return;
  }

  const token = generateManagerToken(period_id);
  res.json({ valid: true, token });
});

export default router;
