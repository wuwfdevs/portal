"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertAcademicPartnershipsCoordinator } from "@/lib/academic-partnerships/access";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { PARTNERSHIP_TYPES } from "@/lib/academic-partnerships/partnership-types";
import type { ApPartnershipType } from "@/lib/database.types";

const SETTINGS_PATH = "/academic-partnerships/settings";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export async function updateSettings(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsCoordinator();

  const isOpen = formData.get("is_open") === "on";
  const introCopy = field(formData, "intro_copy");
  const confirmationCopy = field(formData, "confirmation_copy");
  const appointmentsUrl = field(formData, "google_appointments_url");
  const enabledTypes = formData
    .getAll("enabled_partnership_types")
    .map((value) => String(value))
    .filter((value): value is ApPartnershipType => PARTNERSHIP_TYPES.includes(value as ApPartnershipType));

  if (introCopy === "") failWith(SETTINGS_PATH, "The introductory copy can't be empty.");
  if (confirmationCopy === "") failWith(SETTINGS_PATH, "The confirmation copy can't be empty.");
  if (isOpen && enabledTypes.length === 0) {
    failWith(SETTINGS_PATH, "Enable at least one partnership type before opening the form.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_settings")
    .update({
      is_open: isOpen,
      intro_copy: introCopy,
      confirmation_copy: confirmationCopy,
      google_appointments_url: appointmentsUrl || null,
      enabled_partnership_types: enabledTypes,
      updated_by: profile.id,
    })
    .eq("id", true);
  failIfError(error, SETTINGS_PATH, "Could not save settings");

  await logAuditEvent({
    actorId: profile.id,
    action: "ap.settings.updated",
    targetType: "ap_settings",
    metadata: { is_open: isOpen, enabled_partnership_types: enabledTypes },
  });

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/partner");
  redirect(SETTINGS_PATH);
}

export async function updateEmailTemplate(formData: FormData): Promise<void> {
  const { profile } = await assertAcademicPartnershipsCoordinator();
  const key = field(formData, "key");
  const subject = field(formData, "subject");
  const body = field(formData, "body");

  if (subject === "" || body === "") {
    failWith(SETTINGS_PATH, "A template needs both a subject and a body.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ap_email_templates")
    .update({ subject, body, updated_by: profile.id })
    .eq("key", key);
  failIfError(error, SETTINGS_PATH, "Could not save the template");

  await logAuditEvent({
    actorId: profile.id,
    action: "ap.email_template.updated",
    targetType: "ap_email_template",
    targetId: key,
  });

  revalidatePath(SETTINGS_PATH);
  redirect(SETTINGS_PATH);
}
