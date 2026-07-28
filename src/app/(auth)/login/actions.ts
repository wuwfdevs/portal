"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthRedirectOrigin } from "@/lib/site-url";
import { isValidEmail } from "@/lib/validation";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "no_account"; email: string }
  | { status: "error"; message: string };

/**
 * New access is granted via admin invite or the /request-access form, not
 * self-service signup (shouldCreateUser: false) — so signInWithOtp fails
 * with a distinctive "otp_disabled" error whenever no auth.users row exists
 * yet for this email. We surface that as a clear "no account, go request
 * access" message rather than a generic success state.
 *
 * Trade-off: this makes it possible to probe whether a given email has an
 * account (email enumeration) in exchange for a much clearer failure mode.
 * For a small internal-only portal that's the right call; reconsider if
 * this app ever gets public-facing exposure.
 */
export async function requestSignInLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      // The host this request came in on, not a configured one: the PKCE
      // code_verifier cookie lives on whatever host the browser is using,
      // and /auth/callback has to be able to read it back. See
      // resolveRedirectOrigin().
      emailRedirectTo: `${await getAuthRedirectOrigin()}/auth/callback`,
    },
  });

  if (error) {
    if (error.code === "otp_disabled") {
      return { status: "no_account", email };
    }
    return {
      status: "error",
      message: "Something went wrong sending the sign-in link. Please try again shortly.",
    };
  }

  return { status: "sent", email };
}
