import { createHash, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Optional API-key authentication.
 *
 * If env `API_KEY` is set, every request must present it as either
 *   Authorization: Bearer <key>
 * or
 *   x-api-key: <key>
 * Comparison is constant-time (sha256 both sides, then timingSafeEqual).
 *
 * If `API_KEY` is NOT set we log one prominent warning at startup and allow
 * all traffic, so existing unauthenticated deployments keep working.
 *
 * The health check (GET on the health path) is always exempt.
 */

let warnedUnauth = false;

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function keysMatch(provided: string, expected: string): boolean {
  const a = sha256(provided);
  const b = sha256(expected);
  // Both are 32-byte sha256 digests, so lengths always match.
  return timingSafeEqual(a, b);
}

function extractKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey.length > 0) {
    return xApiKey;
  }
  return null;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.API_KEY;

  if (!expected) {
    if (!warnedUnauth) {
      warnedUnauth = true;
      logger.warn(
        "API_KEY not set — API is UNAUTHENTICATED. Set the API_KEY environment variable to require a key on every request.",
      );
    }
    next();
    return;
  }

  // Exempt the health check so uptime probes work without a key.
  // The health route is GET /api/healthz (see routes/health.ts). This
  // middleware runs at the app level (before the /api mount), so req.path is
  // the full path; match by suffix to be mount-agnostic.
  if (
    req.method === "GET" &&
    (req.path.endsWith("/healthz") || req.path.endsWith("/health"))
  ) {
    next();
    return;
  }

  const provided = extractKey(req);
  if (provided && keysMatch(provided, expected)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
