"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertBookingsIntakeEditor } from "@/lib/bookings/access";
import { parseOfferedPackages } from "@/lib/bookings/intake";
import { INTAKE_PATH } from "@/lib/bookings/paths";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * The public form's settings: open or closed, its three pieces of copy, and
 * the services it offers by name. The director's or the executive's
 * (bk_settings_update is the boundary); audited, since opening the form is
 * what lets requests arrive from outside the portal.
 */
export async function updateIntakeSettings(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsIntakeEditor();

  const isOpen = formData.get("is_open") === "on";
  const introCopy = field(formData, "intro_copy");
  const confirmationCopy = field(formData, "confirmation_copy");
  const closedCopy = field(formData, "closed_copy");
  const packages = parseOfferedPackages(field(formData, "offered_packages"));

  if (introCopy === "") failWith(INTAKE_PATH, "The introductory copy can't be empty.");
  if (confirmationCopy === "") failWith(INTAKE_PATH, "The confirmation copy can't be empty.");
  if (closedCopy === "") failWith(INTAKE_PATH, "The closed copy can't be empty.");
  if (!packages.ok) failWith(INTAKE_PATH, packages.error);
  if (isOpen && packages.names.length === 0) {
    failWith(INTAKE_PATH, "Offer at least one service before opening the form.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_settings")
    .update({
      is_open: isOpen,
      intro_copy: introCopy,
      confirmation_copy: confirmationCopy,
      closed_copy: closedCopy,
      offered_packages: packages.names,
      updated_by: profile.id,
    })
    .eq("id", true);
  failIfError(error, INTAKE_PATH, "Could not save the form's settings");

  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.intake.updated",
    targetType: "bk_settings",
    metadata: { is_open: isOpen, offered_packages: packages.names },
  });

  revalidatePath(INTAKE_PATH);
  revalidatePath("/book");
  revalidatePath("/book/embed");
  redirect(`${INTAKE_PATH}?saved=1`);
}
