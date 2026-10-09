import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/auth/authz";
import { getCurrentProfile } from "@/lib/auth/session";

/**
 * The one way a route handler turns an `assert…()` check (which throws
 * ForbiddenError) into an HTTP response. ForbiddenError alone can't say
 * whether nobody is signed in or someone is signed in and refused, so on a
 * refusal this looks the profile up: none → 401, otherwise (forbidden or a
 * disabled account) → 403. Anything that isn't a ForbiddenError is rethrown.
 *
 * `body` lets a caller with its own error envelope (the MCP transport's
 * JSON-RPC error) shape the response; the default is `{ error: message }`.
 */
export type RouteGuardResult<T> =
  { ok: true; value: T } | { ok: false; response: NextResponse | Response };

export function guardStatus(hasProfile: boolean): 401 | 403 {
  return hasProfile ? 403 : 401;
}

export async function guardRoute<T>(
  assertFn: () => Promise<T>,
  options: { body?: (message: string) => unknown } = {},
): Promise<RouteGuardResult<T>> {
  try {
    return { ok: true, value: await assertFn() };
  } catch (error) {
    if (!(error instanceof ForbiddenError)) throw error;
    const profile = await getCurrentProfile();
    const status = guardStatus(profile !== null);
    const body = options.body ? options.body(error.message) : { error: error.message };
    return { ok: false, response: NextResponse.json(body, { status }) };
  }
}
