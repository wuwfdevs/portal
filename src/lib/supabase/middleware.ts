import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const PUBLIC_PATHS = [
  "/login",
  "/request-access",
  "/auth/callback",
  // Third-party webhook callback: carries no Supabase session (it's
  // authenticated by its own shared secret — see that route's comment), so
  // it must never hit the login redirect below.
  "/api/transcription/webhook",
  // Remote Interview guest join: a guest has no profile and never signs in
  // through /login — they get an anonymous session on this route itself
  // (see src/app/join/[token]/actions.ts). Outside both (portal) and (auth)
  // for the same reason (docs/remote-interview-design.md, "Fit with portal
  // conventions").
  "/join",
  // Audience Listening's public participation page and its iframe variant.
  // Same reasoning as /join above: a participant has no profile and never
  // signs in through /login — they get an anonymous session on this route
  // itself, and only when they press Begin (see
  // src/lib/audience-listening/participant.ts).
  "/listen",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and redirects
 * unauthenticated users away from portal routes. This is a convenience
 * redirect, not the authorization boundary itself — RLS and the server-side
 * checks in lib/auth/authz.ts are what actually gate data and actions.
 *
 * /auth/callback is skipped entirely, before any Supabase client is even
 * created: it's about to exchange a one-time PKCE code for a brand-new
 * session, and there's nothing to refresh yet. Touching cookies here first
 * risks interfering with the code_verifier cookie the exchange depends on.
 */
export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname === "/auth/callback" || request.nextUrl.pathname.startsWith("/auth/callback/")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
