import { Router } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { generateManagerToken } from "../managerToken";
import { rateLimit } from "../middlewares/rateLimit";
import { parseBody } from "../lib/validate";

const router = Router();

// Per-IP rate limit for password verification: 5 attempts / 15 minutes.
const verifyPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many attempts. Try again later.",
});

const verifyPasswordSchema = z.object({
  password: z.string().optional(),
  period_id: z.number().optional(),
});

/** Constant-time string comparison (sha256 both sides so lengths match). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

router.post("/verify-password", verifyPasswordLimiter, (req, res) => {
  const body = parseBody(verifyPasswordSchema, req.body, res);
  if (!body) return;
  const { password, period_id } = body;

  const managerPassword = process.env.MANAGER_PASSWORD;
  if (!managerPassword) {
    res.status(503).json({ error: "Manager password is not configured on this server. Set the MANAGER_PASSWORD environment secret." });
    return;
  }

  if (typeof password !== "string" || !safeEqual(password, managerPassword)) {
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
