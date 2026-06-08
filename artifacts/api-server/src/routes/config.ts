import { Router } from "express";

const router = Router();

const DEFAULT_PASSWORD = "Manager2024";

router.post("/verify-password", (req, res) => {
  const { password } = req.body as { password?: string };
  const managerPassword = process.env.MANAGER_PASSWORD || DEFAULT_PASSWORD;
  const valid = typeof password === "string" && password === managerPassword;
  res.json({ valid });
});

export default router;
