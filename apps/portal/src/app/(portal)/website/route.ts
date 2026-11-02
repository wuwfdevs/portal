// "Open Tool" for the Website tool: signs the staff member in to the public site's CMS. The Portal is the
// identity provider (docs: apps/site/ARCHITECTURE.md). This mints a short-lived signed token for the
// signed-in profile and redirects the browser to the site, which verifies it, provisions or updates the
// matching Payload user, and refuses a second use of the same token.
//
// A GET that mints a token is deliberate: it is what a tool card's link opens. It is safe to trigger from
// elsewhere because the redirect target is fixed by configuration, never by the request.

import { NextResponse } from "next/server";
import { mintIdentityToken } from "@wuwf/portal-contracts";
import { logAuditEvent } from "@/lib/audit";
import { requireToolAccess } from "@/lib/auth/authz";
import { lookupToolGrant } from "@/lib/auth/tool-grant";
import { buildSignInUrl, readWebsiteConfig } from "@/lib/website/handoff";
import { parseWebsiteRoles } from "@/lib/website/roles";

/** Long enough to follow a redirect, short enough that a leaked URL is dead almost at once. */
const TOKEN_LIFETIME_SECONDS = 60;

export async function GET() {
  const { profile, tool } = await requireToolAccess("website");

  const config = readWebsiteConfig({
    WEBSITE_ORIGIN: process.env.WEBSITE_ORIGIN,
    WEBSITE_IDENTITY_SECRET: process.env.WEBSITE_IDENTITY_SECRET,
  });
  if (!config.ok) {
    // The reasons go to the server log; the person is told only what they can act on.
    console.error("Website sign-in is not configured:", config.problems.join("; "));
    return new NextResponse(
      "Signing in to WUWF.org isn't set up on this server yet. Ask an administrator.",
      { status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const { roles: granted } = await lookupToolGrant(profile, tool);
  const roles = parseWebsiteRoles(granted);

  const token = await mintIdentityToken(
    { userId: profile.id, email: profile.email, name: profile.display_name, roles, lifetimeSeconds: TOKEN_LIFETIME_SECONDS },
    config.config.secret,
  );

  await logAuditEvent({
    actorId: profile.id,
    action: "website.sso.opened",
    targetType: "tool",
    targetId: tool.id,
    metadata: { roles },
  });

  return NextResponse.redirect(buildSignInUrl(config.config.origin, token), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
