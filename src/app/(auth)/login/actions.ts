"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { isValidEmail } from "@/lib/validation";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/**
 * Sends a magic link if, and only if, an active-eligible account already
 * exists for this email — but always reports the same "check your email"
 * outcome either way, so this endpoint can't be used to enumerate accounts.
 * New access is granted via admin invite or the /request-access form, not
 * self-service signup (shouldCreateUser: false).
 */
export async function requestSignInLink(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(email)) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  return { status: "sent", email };
}
