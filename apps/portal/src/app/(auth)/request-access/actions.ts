"use server";

import { createClient } from "@/lib/supabase/server";
import { field, optionalField } from "@/lib/form-fields";
import { isValidEmail } from "@/lib/validation";

export type RequestAccessState =
  { status: "idle" } | { status: "submitted" } | { status: "error"; message: string };

export async function submitAccessRequest(
  _prevState: RequestAccessState,
  formData: FormData,
): Promise<RequestAccessState> {
  const email = field(formData, "email").toLowerCase();
  const displayName = field(formData, "display_name");
  const note = optionalField(formData, "note");

  if (!isValidEmail(email) || !displayName) {
    return { status: "error", message: "Enter your name and a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    email,
    display_name: displayName,
    note,
  });

  if (error) {
    console.error("Could not record the access request:", error);
    return {
      status: "error",
      message: "Something went wrong submitting your request. Please try again.",
    };
  }

  return { status: "submitted" };
}
