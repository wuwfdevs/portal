import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * A dedicated, non-cookie Supabase client for the public participation flow
 * (`/listen/[publicId]`) — the one deliberate departure from this repo's
 * usual two clients (`lib/supabase/{server,client}.ts`).
 *
 * Root cause, confirmed in production logs (2026-07-30), not guessed: every
 * other Supabase client in this app shares its session via cookies
 * (`createBrowserClient` from `@supabase/ssr`, the same package server and
 * client), specifically so a Server Component can read "who is signed in"
 * without a separate handshake. That sharing depends on the browser attaching
 * the cookie on the next request, which is exactly what breaks here: this
 * route is loaded cross-origin, inside a Grove article's iframe, so a cookie
 * set by the anonymous sign-in is a third-party cookie from the browser's
 * point of view. SameSite=Lax (the default, and what `@supabase/ssr` sets)
 * excludes a cookie from every request except a top-level navigation — a
 * Server Action's POST from inside the iframe does not qualify.
 *
 * The logs showed the exact signature: `al_start_submission` succeeded
 * immediately after `signInAnonymously()`, because that RPC call reuses the
 * session already held in memory within the *same* request — no cookie round
 * trip needed yet. The very next request that had to recover the session
 * *from* cookies (`al_reserve_answer`, ~15 seconds later, a separate Server
 * Action invocation) failed with Postgres error 42501, "permission denied" —
 * exactly what happens when a call meant for `authenticated` arrives as
 * `anon`, because no cookie came back.
 *
 * The fix is the storage mechanism, not the cookies themselves. This client
 * uses plain `createClient` from `@supabase/supabase-js` — bypassing
 * `@supabase/ssr` entirely — whose default session store is `localStorage`.
 * supabase-js attaches that session as an `Authorization: Bearer` header on
 * every request it makes: a JS-reads-storage-then-sets-a-header operation,
 * not a cookie the browser decides whether to send. It is unaffected by
 * SameSite or third-party cookie partitioning. Nothing is lost by keeping
 * this session off the server entirely — unlike a signed-in staff page, this
 * route never personalizes server-side; it renders identically for every
 * visitor until they press Begin, entirely client-side from there.
 *
 * Security note, stated plainly rather than left implicit: this trades an
 * httpOnly cookie (unreadable by page JS) for a bearer token in localStorage
 * (readable by any script on this origin). That would be a real downgrade for
 * a staff session holding real credentials and tool access — it is not one
 * here. This token's entire privilege is exactly what the seven `al_*`
 * security-definer functions grant an anonymous participant (create a
 * submission, write their own in-progress answers, read their own progress —
 * see the migration's header comment), scoped to the one submission the same
 * browser tab is already actively creating. Anyone who could read this token
 * via XSS already controls the tab and could do everything the token can do
 * directly through the DOM — the token adds no reach an attacker didn't
 * already have.
 */

let cached: SupabaseClient<Database> | null = null;

export function createPublicAudienceClient(): SupabaseClient<Database> {
  if (cached) return cached;

  cached = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        // Distinct from every cookie-based client's storage key, so this
        // session can never collide with — or be mistaken for — a staff
        // member's portal session sharing the same browser.
        storageKey: "sb-audience-listening-participant",
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
  return cached;
}
