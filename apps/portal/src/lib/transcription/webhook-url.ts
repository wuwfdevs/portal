// Where the speech provider calls back when a transcript is finished. Pure, so the one environment-dependent rule is tested.

const BYPASS_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The address AssemblyAI posts the finished transcript to.
 *
 * Every Vercel preview deployment is behind Deployment Protection, which answers a caller that is not signed in to Vercel with a
 * login page, so a callback to a preview would never reach this route and no transcript would ever finish. AssemblyAI can set one
 * custom header, and that one carries our own webhook secret, so on a preview deployment only, the project's "Protection Bypass for
 * Automation" secret (`VERCEL_AUTOMATION_BYPASS_SECRET`, which Vercel injects into the project's deployments) goes in the query
 * string, which Vercel accepts for callers that cannot set headers. Production, on its own domain, never sends it: a bypass secret in
 * a URL is visible to the provider and its logs, and the route still checks our own secret before doing anything.
 */
export function transcriptionWebhookUrl(siteUrl: string, env: Record<string, string | undefined> = process.env): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/api/transcription/webhook`;
  const bypass = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (env.VERCEL_ENV === "preview" && bypass && BYPASS_SHAPE.test(bypass)) {
    return `${base}?x-vercel-protection-bypass=${encodeURIComponent(bypass)}`;
  }
  return base;
}
