"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  assertBookingsAccess,
  assertBookingsBlockKeeper,
  assertBookingsExecutive,
  assertBookingsScheduler,
} from "@/lib/bookings/access";
import {
  agreementColumns,
  validateAgreementForm,
  validatePartnerForm,
  type AgreementFormValues,
  type PartnerFormValues,
} from "@/lib/bookings/agreements";
import {
  BOOKINGS_PATH,
  CALENDAR_PATH,
  PARTNERS_PATH,
  agreementEditHref,
  agreementHref,
  agreementNewHref,
  partnerEditHref,
  partnerHref,
} from "@/lib/bookings/paths";
import type { BkPartnerKind } from "@/lib/database.types";
import { shiftDateISO } from "@/lib/log/timezone";
import { isUuid } from "@/lib/form-fields";
import { pathIsUnder } from "@/lib/storage-paths";
import { signedUrl } from "@/lib/storage-sign";
import { isValidDateISO } from "@/lib/log/week-layout";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function uuidField(formData: FormData, name: string, path: string, label: string): string {
  const value = field(formData, name);
  if (!UUID.test(value)) failWith(path, `${label} could not be found.`);
  return value;
}

function revalidatePartners(partnerId?: string, agreementId?: string): void {
  revalidatePath(BOOKINGS_PATH);
  revalidatePath(PARTNERS_PATH);
  revalidatePath(CALENDAR_PATH);
  if (partnerId) revalidatePath(partnerHref(partnerId));
  if (partnerId && agreementId) revalidatePath(agreementHref(partnerId, agreementId));
}

// Partners ------------------------------------------------------------------------------------------------

function partnerValues(formData: FormData): PartnerFormValues {
  return {
    name: field(formData, "name"),
    kind: field(formData, "kind"),
    contactName: field(formData, "contact_name"),
    contactEmail: field(formData, "contact_email"),
    contactPhone: field(formData, "contact_phone"),
    defaultFundingIndex: field(formData, "default_funding_index"),
    notes: field(formData, "notes"),
  };
}

function partnerColumns(values: PartnerFormValues) {
  return {
    name: values.name.trim(),
    kind: values.kind as BkPartnerKind,
    contact_name: values.contactName || null,
    contact_email: values.contactEmail || null,
    contact_phone: values.contactPhone || null,
    default_funding_index: values.defaultFundingIndex || null,
    notes: values.notes || null,
  };
}

export async function createPartner(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const path = `${PARTNERS_PATH}/new`;
  const values = partnerValues(formData);
  const problem = validatePartnerForm(values);
  if (problem) failWith(path, problem);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_partners")
    .insert({ ...partnerColumns(values), created_by: profile.id })
    .select("id")
    .single();
  if (error?.code === "23505") {
    failWith(path, `A partner named "${values.name.trim()}" is already on file.`);
  }
  failIfError(error, path, "Could not add the partner");
  if (!data) failWith(path, "Could not add the partner.");
  revalidatePartners(data.id);
  redirect(partnerHref(data.id, { saved: "created" }));
}

export async function updatePartner(formData: FormData): Promise<void> {
  await assertBookingsScheduler();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const path = partnerEditHref(partnerId);
  const values = partnerValues(formData);
  const problem = validatePartnerForm(values);
  if (problem) failWith(path, problem);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_partners")
    .update(partnerColumns(values))
    .eq("id", partnerId);
  if (error?.code === "23505") {
    failWith(path, `A partner named "${values.name.trim()}" is already on file.`);
  }
  failIfError(error, path, "Could not save the partner");
  revalidatePartners(partnerId);
  redirect(partnerHref(partnerId, { saved: "1" }));
}

// Agreements ----------------------------------------------------------------------------------------------

function agreementValues(formData: FormData): AgreementFormValues {
  return {
    label: field(formData, "label"),
    startsOn: field(formData, "starts_on"),
    endsOn: field(formData, "ends_on"),
    reserveHoursAllocated: field(formData, "reserve_hours_allocated"),
    fundedStudentHours: field(formData, "funded_student_hours"),
    expectedVolume: field(formData, "expected_volume"),
    bookingDeadlineDays: field(formData, "booking_deadline_days"),
    releaseDeadlineDays: field(formData, "release_deadline_days"),
    blackoutNotes: field(formData, "blackout_notes"),
    directCostTreatment: field(formData, "direct_cost_treatment"),
    capitalNotes: field(formData, "capital_notes"),
    beyondEnvelopeNote: field(formData, "beyond_envelope_note"),
    airtimeMinutesPerWeek: field(formData, "airtime_minutes_per_week"),
    notes: field(formData, "notes"),
  };
}

export async function createAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsScheduler();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const path = agreementNewHref(partnerId);
  const values = agreementValues(formData);
  const problem = validateAgreementForm(values);
  if (problem) failWith(path, problem);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_agreements")
    .insert({ partner_id: partnerId, ...agreementColumns(values), created_by: profile.id })
    .select("id")
    .single();
  failIfError(error, path, "Could not draft the agreement");
  if (!data) failWith(path, "Could not draft the agreement.");
  revalidatePartners(partnerId, data.id);
  redirect(agreementHref(partnerId, data.id, { saved: "created" }));
}

export async function updateAgreement(formData: FormData): Promise<void> {
  await assertBookingsScheduler();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const path = agreementEditHref(partnerId, agreementId);
  const values = agreementValues(formData);
  const problem = validateAgreementForm(values);
  if (problem) failWith(path, problem);
  const supabase = await createClient();
  // The guard trigger refuses a change to an approved agreement's terms by anyone but the executive.
  const { error } = await supabase
    .from("bk_agreements")
    .update(agreementColumns(values))
    .eq("id", agreementId)
    .eq("partner_id", partnerId);
  failIfError(error, path, "Could not save the agreement");
  revalidatePartners(partnerId, agreementId);
  redirect(agreementHref(partnerId, agreementId, { saved: "1" }));
}

/** The executive approves a drafted agreement (§3H); bk_guard_agreement() is the boundary. */
export async function approveAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsExecutive();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_agreements")
    .update({ status: "active" })
    .eq("id", agreementId)
    .eq("status", "draft");
  failIfError(error, path, "Could not approve the agreement");
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.agreement.approved",
    targetType: "bk_agreement",
    targetId: agreementId,
    metadata: { partner_id: partnerId },
  });
  revalidatePartners(partnerId, agreementId);
  redirect(agreementHref(partnerId, agreementId, { saved: "approved" }));
}

/** Ending an agreement: its blocks stop reserving and no project is priced under it. The director's or the executive's. */
export async function endAgreement(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsBlockKeeper();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_agreements")
    .update({ status: "ended" })
    .eq("id", agreementId)
    .neq("status", "ended");
  failIfError(error, path, "Could not end the agreement");
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.agreement.ended",
    targetType: "bk_agreement",
    targetId: agreementId,
    metadata: { partner_id: partnerId },
  });
  revalidatePartners(partnerId, agreementId);
  redirect(agreementHref(partnerId, agreementId, { saved: "ended" }));
}

/** A draft that was never approved can be deleted; the delete policy is scoped to drafts. */
export async function deleteAgreement(formData: FormData): Promise<void> {
  await assertBookingsScheduler();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("bk_agreements")
    .delete({ count: "exact" })
    .eq("id", agreementId)
    .eq("status", "draft");
  failIfError(error, path, "Could not delete the draft");
  if (!count) failWith(path, "Only a draft agreement can be deleted.");
  revalidatePartners(partnerId);
  redirect(partnerHref(partnerId, { saved: "deleted" }));
}

// Reserved blocks ------------------------------------------------------------------------------------------

export async function addReservedBlock(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsBlockKeeper();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const path = agreementHref(partnerId, agreementId, { new: "block" });
  const poolId = field(formData, "pool_id");
  if (!UUID.test(poolId)) failWith(path, "Choose a pool.");
  const listed = field(formData, "window");
  let start: string;
  let end: string;
  if (listed && listed !== "custom") {
    [start = "", end = ""] = listed.split("-");
    if (!TIME.test(start) || !TIME.test(end)) failWith(path, "Choose a window.");
  } else {
    start = field(formData, "window_start").slice(0, 5);
    end = field(formData, "window_end").slice(0, 5);
    if (!TIME.test(start) || !TIME.test(end) || end <= start) {
      failWith(path, "The window needs a start before its end, as 08:00 and 12:00.");
    }
  }
  // One date, or the same weekday every week between two dates.
  const dates: string[] = [];
  const date = field(formData, "date");
  if (!isValidDateISO(date)) failWith(path, "The first date must be a date.");
  const repeatUntil = field(formData, "repeat_until");
  if (repeatUntil) {
    if (!isValidDateISO(repeatUntil) || repeatUntil < date)
      failWith(path, "Repeat until must be a date on or after the first.");
    for (let d = date; d <= repeatUntil; d = shiftDateISO(d, 7)) dates.push(d);
    if (dates.length > 60) failWith(path, "That is more than 60 weeks of blocks; split it up.");
  } else {
    dates.push(date);
  }
  const notes = field(formData, "notes") || null;

  const supabase = await createClient();
  const { error } = await supabase.from("bk_reserved_blocks").insert(
    dates.map((d) => ({
      agreement_id: agreementId,
      pool_id: poolId,
      date: d,
      window_start: start,
      window_end: end,
      notes,
      created_by: profile.id,
    })),
  );
  failIfError(error, path, "Could not reserve the block");
  revalidatePartners(partnerId, agreementId);
  redirect(agreementHref(partnerId, agreementId));
}

/** Release a block by hand — before its deadline, or one the director had kept. */
export async function releaseReservedBlock(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsBlockKeeper();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const blockId = uuidField(
    formData,
    "block_id",
    agreementHref(partnerId, agreementId),
    "That block",
  );
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { data: block } = await supabase
    .from("bk_reserved_blocks")
    .select("project_id")
    .eq("id", blockId)
    .maybeSingle();
  if (!block) failWith(path, "That block no longer exists.");
  if (block.project_id) failWith(path, "A booked block is freed by releasing the project's date.");
  const { error } = await supabase
    .from("bk_reserved_blocks")
    .update({ released_at: new Date().toISOString(), kept_by: null, kept_at: null })
    .eq("id", blockId);
  failIfError(error, path, "Could not release the block");
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.reserved_block.released",
    targetType: "bk_reserved_block",
    targetId: blockId,
    metadata: { agreement_id: agreementId },
  });
  revalidatePartners(partnerId, agreementId);
  redirect(path);
}

/** Keep an unbooked block past its release deadline (§5); bk_guard_reserved_block() keeps this for the director. */
export async function keepReservedBlock(formData: FormData): Promise<void> {
  const { profile } = await assertBookingsBlockKeeper();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const blockId = uuidField(
    formData,
    "block_id",
    agreementHref(partnerId, agreementId),
    "That block",
  );
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("bk_reserved_blocks")
    .update({ kept_by: profile.id, released_at: null })
    .eq("id", blockId)
    .is("project_id", null);
  failIfError(error, path, "Could not keep the block");
  await logAuditEvent({
    actorId: profile.id,
    action: "bookings.reserved_block.kept",
    targetType: "bk_reserved_block",
    targetId: blockId,
    metadata: { agreement_id: agreementId },
  });
  revalidatePartners(partnerId, agreementId);
  redirect(path);
}

/** Remove a block nobody took — a drafting correction, not a release. */
export async function deleteReservedBlock(formData: FormData): Promise<void> {
  await assertBookingsBlockKeeper();
  const partnerId = uuidField(formData, "partner_id", PARTNERS_PATH, "That partner");
  const agreementId = uuidField(formData, "agreement_id", partnerHref(partnerId), "That agreement");
  const blockId = uuidField(
    formData,
    "block_id",
    agreementHref(partnerId, agreementId),
    "That block",
  );
  const path = agreementHref(partnerId, agreementId);
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("bk_reserved_blocks")
    .delete({ count: "exact" })
    .eq("id", blockId)
    .is("project_id", null);
  failIfError(error, path, "Could not remove the block");
  if (!count) failWith(path, "A booked block is freed by releasing the project's date.");
  revalidatePartners(partnerId, agreementId);
  redirect(path);
}

// The signed agreement -----------------------------------------------------------------------------------

const DOCUMENTS_BUCKET = "bookings-documents";

export async function completeAgreementDocumentUpload(
  agreementId: string,
  storagePath: string,
): Promise<{ error?: string }> {
  await assertBookingsScheduler();
  if (!isUuid(agreementId) || !pathIsUnder(agreementId, storagePath)) {
    return { error: "That upload does not belong to this agreement." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bk_agreements")
    .update({ document_path: storagePath })
    .eq("id", agreementId)
    .select("partner_id")
    .maybeSingle();
  if (error || !data) {
    console.error("Could not save the uploaded agreement document", error);
    return { error: "Could not save the uploaded document." };
  }
  revalidatePath(agreementHref(data.partner_id, agreementId));
  return {};
}

export async function getAgreementDocumentDownloadUrl(
  agreementId: string,
  storagePath: string,
): Promise<{ url?: string; error?: string }> {
  await assertBookingsAccess();
  if (!isUuid(agreementId) || !pathIsUnder(agreementId, storagePath)) {
    return { error: "That document does not belong to this agreement." };
  }
  const url = await signedUrl(DOCUMENTS_BUCKET, storagePath, { ttlSeconds: 300 });
  if (!url) return { error: "Could not create a download link." };
  return { url };
}
