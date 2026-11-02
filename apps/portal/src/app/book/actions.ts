"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { field } from "@/lib/form-fields";
import { clientIpFromHeaders, hashIpAddress } from "@/lib/academic-partnerships/rate-limit";
import {
  buildIntakePayload,
  intakeErrorMessage,
  isHoneypotTripped,
  validateIntakeInput,
  type IntakeInput,
} from "@/lib/bookings/intake";

export type SubmitRequestState =
  | { status: "idle" }
  | { status: "submitted"; confirmationCopy: string }
  | { status: "error"; message: string };

const DEFAULT_CONFIRMATION =
  "Thank you. WUWF's production staff will review your request and follow up by email with an estimate. Nothing is booked until you approve that estimate.";

/**
 * The one write this public route makes. Every real check (open or closed,
 * required fields, email shape, the offered packages, dates, the airtime
 * numbers, the rate limits) happens inside bk_submit_request() itself, in one
 * transaction — this only adds what the server alone can see: the honeypot
 * and timing check (client-side, so a genuine visitor gets a sentence
 * instead of a round trip) and the salted address hash. The shape is
 * src/app/partner/actions.ts's (docs/bookings-design.md §6.3).
 */
export async function submitRequest(
  _prevState: SubmitRequestState,
  formData: FormData,
): Promise<SubmitRequestState> {
  const input: IntakeInput = {
    contactName: field(formData, "contact_name"),
    contactEmail: field(formData, "contact_email"),
    contactPhone: field(formData, "contact_phone"),
    partnerName: field(formData, "partner_name"),
    partnerKind: field(formData, "partner_kind"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    requested: field(formData, "requested"),
    packages: formData.getAll("packages").map((value) => String(value)),
    offeredPackages: formData.getAll("offered_packages").map((value) => String(value)),
    eventStartsOn: field(formData, "event_starts_on"),
    eventEndsOn: field(formData, "event_ends_on"),
    deliverablesDueOn: field(formData, "deliverables_due_on"),
    location: field(formData, "location"),
    airingsPerWeek: field(formData, "airings_per_week"),
    seconds: field(formData, "seconds"),
    airtimeStartsOn: field(formData, "airtime_starts_on"),
    airtimeEndsOn: field(formData, "airtime_ends_on"),
    honeypot: field(formData, "website"),
    renderedAtMs: Number(field(formData, "rendered_at")) || 0,
    nowMs: Date.now(),
  };

  // A tripped honeypot is treated exactly like a successful submission —
  // never say why. No row is written; the visitor sees the confirmation a
  // genuine submitter would.
  if (isHoneypotTripped(input.honeypot)) {
    return { status: "submitted", confirmationCopy: DEFAULT_CONFIRMATION };
  }
  const problem = validateIntakeInput(input);
  if (problem) return { status: "error", message: problem };

  const headerList = await headers();
  const ip = clientIpFromHeaders(headerList);
  const ipHash = ip ? hashIpAddress(ip) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_submit_request", {
    p_payload: buildIntakePayload(input),
    p_ip_hash: ipHash,
  });
  if (error) {
    console.error("bk_submit_request failed", error);
    return { status: "error", message: intakeErrorMessage(null) };
  }

  const result = data as { ok: true; confirmation_copy: string } | { error: string };
  if ("error" in result) return { status: "error", message: intakeErrorMessage(result.error) };
  return {
    status: "submitted",
    confirmationCopy: result.confirmation_copy || DEFAULT_CONFIRMATION,
  };
}
