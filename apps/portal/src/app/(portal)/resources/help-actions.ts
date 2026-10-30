"use server";

import { ForbiddenError } from "@/lib/auth/authz";
import { assertResourcesAccess } from "@/lib/resources/access";
import { loadHelpContent, type HelpContent } from "@/lib/resources/help";

export type HelpResult = { ok: true; content: HelpContent | null } | { ok: false; error: string };

const QUERY_MAX = 200;

/**
 * The Help panel's one read. A non-redirecting action returning data (the
 * shape Editorial Inquiry's canvas and Sourcework's workspace search use),
 * since the panel is a client component that must not reload the page it
 * sits beside. RLS scopes every row it returns.
 */
export async function loadHelp(input: {
  pathname: string;
  search: string;
  query: string;
}): Promise<HelpResult> {
  try {
    await assertResourcesAccess();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: "Help isn't available to your account." };
    }
    throw error;
  }
  try {
    const content = await loadHelpContent(
      String(input.pathname ?? ""),
      String(input.search ?? ""),
      String(input.query ?? "")
        .trim()
        .slice(0, QUERY_MAX),
    );
    return { ok: true, content };
  } catch (error) {
    console.error("Help panel read failed:", error);
    return { ok: false, error: "Help couldn't load. Try again in a moment." };
  }
}
