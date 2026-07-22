"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidEmail } from "@/lib/validation";

export type RequestAccessState =
  | { status: "idle" }
  | { status: "submitted" }
  | { status: "error"; message: string };

export async function submitAccessRequest(
  _prevState: RequestAccessState,
  formData: FormData,
): Promise<RequestAccessState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!isValidEmail(email) || !displayName) {
    return { status: "error", message: "Enter your name and a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    email,
    display_name: displayName,
    note: note || null,
  });

  if (error) {
    return { status: "error", message: "Something went wrong submitting your request. Please try again." };
  }

  return { status: "submitted" };
}
