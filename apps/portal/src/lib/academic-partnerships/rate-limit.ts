import "server-only";
import { createHash } from "node:crypto";

/**
 * A salted hash of the submitter's IP, never the raw address. Salted with a
 * server-only secret so the hash can't be reversed by brute-forcing IPv4
 * space, while still letting ap_submit_inquiry() count recent submissions
 * from "the same visitor" without storing anything identifying. Falls back to
 * a fixed salt in development, where SUPABASE_SECRET_KEY is always set anyway
 * (see .env.example) — reused here rather than adding a new env var for a
 * single hash.
 */
export function hashIpAddress(ipAddress: string): string {
  const salt = process.env.SUPABASE_SECRET_KEY ?? "academic-partnerships-dev-salt";
  return createHash("sha256").update(`${salt}:${ipAddress}`).digest("hex");
}

/**
 * Best-effort client IP from the headers a proxy/CDN sets. There is no
 * standing rate-limit infrastructure in this repository (see design doc §3
 * "Abuse protection") — this is only ever used to compute the hash above.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}
