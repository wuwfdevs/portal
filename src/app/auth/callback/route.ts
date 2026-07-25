import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Lands here from the magic-link email. Exchanges the one-time code for a
 * session; the handle_auth_user_sign_in trigger (see supabase/migrations)
 * flips a freshly-invited profile to 'active' as part of that exchange.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("auth/callback: exchangeCodeForSession failed", {
      message: error.message,
      status: error.status,
      code: error.code,
      url: request.url,
    });
    return NextResponse.redirect(
      `${origin}/login?error=link_expired&reason=${encodeURIComponent(error.code ?? error.message)}`,
    );
  }

  console.error("auth/callback: no code param on request", request.url);
  return NextResponse.redirect(`${origin}/login?error=link_expired&reason=no_code`);
}
