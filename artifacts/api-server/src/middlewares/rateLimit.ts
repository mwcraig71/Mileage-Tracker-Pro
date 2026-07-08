import type { Request, Response, NextFunction } from "express";

/**
 * Tiny in-memory, per-IP rate limiter. No external dependencies.
 * Suitable for protecting a small number of sensitive endpoints (e.g. the
 * manager-password verification) against brute force. State is per-process;
 * that is acceptable for this single-instance deployment.
 */
interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window expires
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const { windowMs, max } = opts;
  const message = opts.message ?? "Too many attempts. Try again later.";
  const buckets = new Map<string, Bucket>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? req.socket?.remoteAddress ?? "unknown";

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    // Opportunistic cleanup so the map does not grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(k);
      }
    }

    if (bucket.count > max) {
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
