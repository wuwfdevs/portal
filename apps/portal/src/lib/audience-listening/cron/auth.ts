import { timingSafeEqual } from "node:crypto";

/**
 * Whether a scheduled request carries the project's cron secret. Vercel sends `Authorization: Bearer <CRON_SECRET>` on every scheduled
 * call. With no secret configured nothing is authorized, so an unconfigured server answers 401 rather than running as an open door.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
