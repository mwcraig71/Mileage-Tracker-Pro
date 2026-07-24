import { timingSafeEqual, createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Escape a string for safe interpolation into HTML (emails, etc.). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal in-memory fixed-window rate limiter (per IP).
 * Suitable for a single-instance deployment like Replit; swap for a
 * store-backed limiter (e.g. express-rate-limit + Redis) if scaled out.
 */
export function makeRateLimiter(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }
    next();
    // Opportunistic cleanup to keep the map bounded
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
  };
}

/** Baseline security headers (helmet-lite, no extra dependency). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
}

/**
 * Optional shared-secret API gate.
 * When APP_API_KEY is set, every /api request (except the allow-list handled
 * in app.ts) must send it as an `x-api-key` header. When unset, the gate is
 * a no-op so existing clients keep working until they're updated to send it.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const required = process.env.APP_API_KEY;
  if (!required) {
    next();
    return;
  }
  const provided = req.headers["x-api-key"];
  if (typeof provided === "string" && safeCompare(provided, required)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
