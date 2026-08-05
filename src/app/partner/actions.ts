"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  hasCourseBasedTrack,
  hasResearchTrack,
  validateInquiryInput,
} from "@/lib/academic-partnerships/partnership-types";
import { clientIpFromHeaders, hashIpAddress } from "@/lib/academic-partnerships/rate-limit";
import type { ApPartnershipType } from "@/lib/database.types";

export type SubmitInquiryState =
  | { status: "idle" }
  | { status: "submitted"; confirmationCopy: string }
  | { status: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  closed: "This form is not currently accepting submissions.",
  invalid_partnership_type: "Choose at least one of the listed collaboration tracks.",
  invalid_email: "Enter a valid email address.",
  missing_required_field: "Fill in the required fields before submitting.",
  invalid_estimated_students_reached: "Enter a number for estimated students reached.",
  rate_limited: "A number of inquiries have come from you recently — please wait a bit and try again.",
};

const DEFAULT_CONFIRMATION =
  "Thank you. WUWF will review your inquiry and follow up by email. Submitting this form does not guarantee a partnership, publication, distribution, or news coverage.";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

const PARTNERSHIP_TYPE_VALUES: ApPartnershipType[] = [
  "classroom_visit",
  "station_immersion",
  "applied_project",
  "internship_practicum",
  "faculty_research",
  "other",
];

/**
 * The one write this public route makes. Every real check (open/closed,
 * required fields by the chosen track(s), email shape, rate limits) happens
 * inside ap_submit_inquiry() itself, in one transaction — this only adds the
 * two things only the server can see: the honeypot/timing check (client-side
 * so a genuine visitor gets a sentence instead of a round trip) and the
 * IP hash. See docs/academic-partnerships-design.md §3.
 */
export async function submitInquiry(
  _prevState: SubmitInquiryState,
  formData: FormData,
): Promise<SubmitInquiryState> {
  const partnershipTypes = formData
    .getAll("partnership_types")
    .map((value) => String(value))
    .filter((value): value is ApPartnershipType => PARTNERSHIP_TYPE_VALUES.includes(value as ApPartnershipType));
  const renderedAtMs = Number(field(formData, "rendered_at")) || 0;

  const problem = validateInquiryInput({
    facultyName: field(formData, "faculty_name"),
    email: field(formData, "email"),
    department: field(formData, "department"),
    description: field(formData, "description"),
    partnershipTypes,
    researchTopic: field(formData, "research_topic"),
    researchSummary: field(formData, "research_summary"),
    honeypot: field(formData, "website"),
    renderedAtMs,
    nowMs: Date.now(),
  });

  // A tripped honeypot is treated exactly like a successful submission —
  // never say why. See design doc §3, "never tell an attacker what tripped
  // the check" — no row is written, but the visitor sees the same
  // confirmation a genuine submitter would.
  if (field(formData, "website") !== "") {
    return { status: "submitted", confirmationCopy: DEFAULT_CONFIRMATION };
  }
  if (problem) {
    return { status: "error", message: problem };
  }

  const headerList = await headers();
  const ip = clientIpFromHeaders(headerList);
  const ipHash = ip ? hashIpAddress(ip) : null;

  // Fields tied to a track the submitter ultimately unchecked (e.g. they
  // picked "faculty research", filled some of it in, then went back and
  // deselected it) are dropped here rather than sent — the multi-step form
  // keeps every field mounted across steps so values survive Back/Next, but
  // a stale value from an abandoned track shouldn't end up on the record.
  const includeCourseFields = hasCourseBasedTrack(partnershipTypes);
  const includeResearchFields = hasResearchTrack(partnershipTypes);

  const payload = {
    faculty_name: field(formData, "faculty_name"),
    email: field(formData, "email"),
    department: field(formData, "department"),
    phone: field(formData, "phone"),
    partnership_types: partnershipTypes,
    course_title: includeCourseFields ? field(formData, "course_title") : "",
    course_number: includeCourseFields ? field(formData, "course_number") : "",
    timeframe: field(formData, "timeframe"),
    estimated_students_reached: field(formData, "estimated_students_reached"),
    learning_objectives: field(formData, "learning_objectives"),
    description: field(formData, "description"),
    student_experience: field(formData, "student_experience"),
    support_requested: field(formData, "support_requested"),
    deliverables: field(formData, "deliverables"),
    relevant_dates: field(formData, "relevant_dates"),
    may_publish: formData.get("may_publish") === "on",
    additional_context: field(formData, "additional_context"),
    research_topic: includeResearchFields ? field(formData, "research_topic") : "",
    research_summary: includeResearchFields ? field(formData, "research_summary") : "",
    research_relevance: includeResearchFields ? field(formData, "research_relevance") : "",
    research_status: includeResearchFields ? field(formData, "research_status") : "",
    research_links: includeResearchFields ? field(formData, "research_links") : "",
    research_dates: includeResearchFields ? field(formData, "research_dates") : "",
    research_availability: includeResearchFields ? field(formData, "research_availability") : "",
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_submit_inquiry", {
    p_payload: payload,
    p_ip_hash: ipHash,
  });

  if (error) {
    console.error("ap_submit_inquiry failed", error);
    return { status: "error", message: "Something went wrong submitting your inquiry. Please try again." };
  }

  const result = data as { ok: true; confirmation_copy: string } | { error: string };
  if ("error" in result) {
    return { status: "error", message: ERROR_MESSAGES[result.error] ?? "Something went wrong submitting your inquiry. Please try again." };
  }

  return { status: "submitted", confirmationCopy: result.confirmation_copy || DEFAULT_CONFIRMATION };
}
