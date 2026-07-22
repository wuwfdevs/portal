/** Base URL used to build auth redirect links. Set NEXT_PUBLIC_SITE_URL per environment. */
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
