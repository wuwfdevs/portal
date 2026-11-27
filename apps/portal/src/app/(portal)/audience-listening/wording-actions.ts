"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { field } from "@/lib/form-fields";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { assertAudienceListeningCoordinator } from "@/lib/audience-listening/access";

const WORDING_PATH = "/audience-listening/consent";
const MAX_CONSENT_TEXT_LENGTH = 4000;
const MAX_OPENING_TEXT_LENGTH = 2000;

/**
 * Adds a numbered version of the words every table's recording is built on. Only a coordinator may, because the consent wording is
 * settled with the University's counsel and the opening is the on-tape half of it. A version is never edited, so a table's agreement
 * always points at the exact words its facilitator read. Both kinds are insert-only tables with the same shape, so one function does both.
 */
async function addWording(
  formData: FormData,
  table: "al_consent_texts" | "al_opening_texts",
  limit: number,
  noun: string,
  audit: string,
): Promise<void> {
  const { profile } = await assertAudienceListeningCoordinator();
  const body = field(formData, "body");
  if (!body) failWith(WORDING_PATH, `Write the ${noun}.`);
  if (body.length > limit) failWith(WORDING_PATH, `The ${noun} can be at most ${limit} characters.`);

  const supabase = await createClient();
  const { error } = await supabase.from(table).insert({ body, created_by: profile.id });
  failIfError(error, WORDING_PATH, `Could not save the ${noun}`);
  await logAuditEvent({ actorId: profile.id, action: audit, targetType: table === "al_consent_texts" ? "al_consent_text" : "al_opening_text" });
  redirect(WORDING_PATH);
}

export async function addConsentText(formData: FormData): Promise<void> {
  await addWording(formData, "al_consent_texts", MAX_CONSENT_TEXT_LENGTH, "consent wording", "al.consent_text.added");
}

export async function addOpeningText(formData: FormData): Promise<void> {
  await addWording(formData, "al_opening_texts", MAX_OPENING_TEXT_LENGTH, "opening", "al.opening_text.added");
}
