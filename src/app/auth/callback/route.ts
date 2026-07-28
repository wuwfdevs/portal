import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands here from the magic-link email. Exchanges the one-time code for a
 * session; the handle_auth_user_sign_in trigger (see supabase/migrations)
 * flips a freshly-invited profile to 'active' as part of that exchange.
 *
 * Failures carry the provider's own error code through to /login as
 * `reason`, which is what lets that screen say something true rather than
 * blaming expiry for every failure. The code the exchange depends on is the
 * one signInWithOtp stored a verifier for — see resolveRedirectOrigin() in
 * lib/site-url.ts for why the link has to come back to the same host.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  function failTo(reason: string) {
    return NextResponse.redirect(
      `${origin}/login?error=sign_in_failed&reason=${encodeURIComponent(reason)}`,
    );
  }

  if (!code) {
    console.error("auth/callback: no code param on request");
    return failTo("no_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Host, not the full URL: request.url carries the one-time code, and a
  // sign-in code has no business sitting in a log. The host is the part
  // that actually diagnoses a verifier mismatch.
  console.error("auth/callback: exchangeCodeForSession failed", {
    message: error.message,
    status: error.status,
    code: error.code,
    host: new URL(request.url).host,
  });

  return failTo(error.code ?? error.message);
}
