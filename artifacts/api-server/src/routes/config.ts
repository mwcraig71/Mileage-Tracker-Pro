import { Router } from "express";
import { generateManagerToken } from "../managerToken";

const router = Router();

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
