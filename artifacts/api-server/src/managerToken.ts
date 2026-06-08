import { createHmac, timingSafeEqual } from "crypto";

export function generateManagerToken(periodId: number): string {
  const password = process.env.MANAGER_PASSWORD;
  if (!password) throw new Error("MANAGER_PASSWORD is not configured");
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const payload = `${periodId}.${expiry}`;
  const sig = createHmac("sha256", password).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyManagerToken(token: string | undefined | null, periodId: number): boolean {
  if (!token) return false;
  const password = process.env.MANAGER_PASSWORD;
  if (!password) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot < 0) return false;
    const sig = decoded.slice(lastDot + 1);
    const payload = decoded.slice(0, lastDot);
    const parts = payload.split(".");
    if (parts.length !== 2) return false;
    const [pidStr, expiryStr] = parts;
    if (parseInt(pidStr, 10) !== periodId) return false;
    const expiry = parseInt(expiryStr, 10);
    if (isNaN(expiry) || Math.floor(Date.now() / 1000) > expiry) return false;
    const expectedSig = createHmac("sha256", password).update(payload).digest("hex");
    const sigBuf      = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length || sigBuf.length === 0) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
