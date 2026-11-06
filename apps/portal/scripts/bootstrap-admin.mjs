#!/usr/bin/env node
// Creates a new station's FIRST administrator, before anyone can sign in to ask for one.
//
// A fresh database has no accounts, and every way of inviting someone (Administration > Users) needs an
// administrator to do it. This is the one-time exception: it sends the invitation the Administration page
// would send, with the platform role set to administrator. It does not edit the profiles table. The profile
// is created by the same database trigger as for any invited person, and becomes active the first time the
// invited person signs in with the emailed link.
//
// It refuses to run if the database already has an administrator, or already has an account for that email,
// so it cannot be used to add a second administrator behind the app's back: after the first, use
// Administration > Users like everyone else.
//
// Needs two environment variables, read from the environment (never printed):
//   NEXT_PUBLIC_SUPABASE_URL   the project's URL
//   SUPABASE_SECRET_KEY        the project's secret key (Settings > API). It bypasses row security; this
//                              script is the only thing in an install that should hold it outside Vercel.
//
//   node --env-file=.env.production scripts/bootstrap-admin.mjs \
//     --email you@station.org --name "Your Name" --site-url https://tools.station.org
//
// See INSTALL.md.

import { pathToFileURL } from "node:url";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads `--email x --name y --site-url z` (or `--flag=value`). Unknown flags are an error. */
export function parseArgs(argv) {
  const out = {};
  const known = new Set(["email", "name", "site-url"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}".`);
    const [flag, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (!known.has(flag))
      throw new Error(`Unknown option --${flag}. Use --email, --name and --site-url.`);
    out[flag] = inline !== undefined ? inline : argv[++i];
  }
  return { email: out.email, displayName: out.name, siteUrl: out["site-url"] };
}

/** Why these options cannot be used, or null. */
export function optionsProblem({ email, displayName, siteUrl }) {
  if (!email || !EMAIL.test(email.trim())) return "Give the administrator's email with --email.";
  if (!displayName || !displayName.trim()) return "Give the administrator's name with --name.";
  if (displayName.trim().length > 120) return "The name is too long (120 characters at most).";
  if (!siteUrl)
    return "Give the Portal's address with --site-url, for example https://tools.station.org.";
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    return `--site-url "${siteUrl}" is not an address.`;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return "--site-url must start with https:// (http:// is allowed only for localhost).";
  }
  return null;
}

/**
 * Invites the first administrator. `client` is a Supabase client built with the secret key.
 * Returns { ok: true, userId } or { ok: false, reason, message }; throws only on an unexpected failure.
 */
export async function bootstrapAdmin({ client, email, displayName, siteUrl }) {
  const problem = optionsProblem({ email, displayName, siteUrl });
  if (problem) return { ok: false, reason: "bad_options", message: problem };
  const address = email.trim().toLowerCase();

  // 1. Only ever the first administrator.
  const admins = await client
    .from("profiles")
    .select("id, email")
    .eq("platform_role", "administrator")
    .limit(1);
  if (admins.error)
    throw new Error(`Could not check for existing administrators: ${admins.error.message}`);
  if (admins.data.length > 0) {
    return {
      ok: false,
      reason: "administrator_exists",
      message:
        "This database already has an administrator. Sign in as them and invite people at Administration > Users.",
    };
  }

  // 2. An invitation may already be waiting (an earlier run that was not followed up).
  const existing = await client
    .from("profiles")
    .select("id, account_status")
    .eq("email", address)
    .limit(1);
  if (existing.error)
    throw new Error(`Could not check for an existing account: ${existing.error.message}`);
  if (existing.data.length > 0) {
    return {
      ok: false,
      reason: "account_exists",
      message: `There is already an account for ${address} (${existing.data[0].account_status}). Open the Portal's sign-in page and ask for a link with that address.`,
    };
  }

  // 3. The same call Administration > Users makes, with the administrator role.
  const invited = await client.auth.admin.inviteUserByEmail(address, {
    data: { display_name: displayName.trim(), platform_role: "administrator" },
    redirectTo: `${new URL(siteUrl).origin}/auth/callback`,
  });
  if (invited.error || !invited.data?.user) {
    throw new Error(
      `The invitation could not be sent: ${invited.error?.message ?? "no user returned"}`,
    );
  }
  const userId = invited.data.user.id;

  // 4. A line in the audit log, so the first administrator is not unexplained. Best effort: the invitation
  //    has been sent either way.
  const audit = await client.from("audit_events").insert({
    actor_id: userId,
    action: "admin.bootstrapped",
    target_type: "user",
    target_id: userId,
    metadata: { via: "scripts/bootstrap-admin.mjs" },
  });
  return { ok: true, userId, auditWritten: !audit.error };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const problem = optionsProblem(options);
  if (problem) {
    console.error(problem);
    process.exit(2);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set (for example with --env-file). Nothing was changed.",
    );
    process.exit(2);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let result;
  try {
    result = await bootstrapAdmin({ client, ...options });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!result.ok) {
    console.error(result.message);
    process.exit(result.reason === "bad_options" ? 2 : 1);
  }
  console.log(`Invitation sent to ${options.email.trim().toLowerCase()}.`);
  console.log(
    "Open the link in that email to sign in; the account becomes active the first time you do.",
  );
  if (!result.auditWritten)
    console.log("(The audit-log line could not be written; the invitation was sent.)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
