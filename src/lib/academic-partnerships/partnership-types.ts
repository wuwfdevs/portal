// Pure labels, conditional-field rules, and public-form validation. No
// Supabase, no React — colocated tests cover it directly.

import { isValidEmail } from "@/lib/validation";
import type { ApPartnershipType } from "@/lib/database.types";

export const PARTNERSHIP_TYPES: ApPartnershipType[] = [
  "classroom_visit",
  "station_immersion",
  "applied_project",
  "internship_practicum",
  "faculty_research",
  "other",
];

export const PARTNERSHIP_TYPE_LABEL: Record<ApPartnershipType, string> = {
  classroom_visit: "Classroom visit or workshop",
  station_immersion: "Class visit to WUWF",
  applied_project: "Applied class project",
  internship_practicum: "Internship or practicum",
  faculty_research: "Faculty research or subject-matter expertise",
  other: "Another partnership idea",
};

/** Whether this submission is on the research/expertise path rather than the teaching path. */
export function isResearchType(type: ApPartnershipType): boolean {
  return type === "faculty_research";
}

/** Whether course fields make sense to ask for — teaching-and-student-engagement types only. */
export function isCourseBasedType(type: ApPartnershipType): boolean {
  return type === "classroom_visit" || type === "station_immersion" || type === "applied_project";
}

export interface InquiryInput {
  facultyName: string;
  email: string;
  department: string;
  description: string;
  partnershipType: ApPartnershipType;
  researchTopic: string;
  researchSummary: string;
  honeypot: string;
  renderedAtMs: number;
  nowMs: number;
}

export const MIN_SUBMIT_ELAPSED_MS = 3000;

/**
 * Null when valid; otherwise a sentence for the screen. Mirrors, but does not
 * replace, ap_submit_inquiry()'s own checks — the database is the actual
 * enforcement point (a hand-crafted request can't skip it), this is so a
 * genuine visitor gets a sentence instead of a round trip.
 */
export function validateInquiryInput(input: InquiryInput): string | null {
  if (input.honeypot.trim() !== "") {
    // Never say why — see design doc §3, "never tell an attacker what tripped
    // the check". The caller treats this the same as a successful submit.
    return null;
  }
  if (input.nowMs - input.renderedAtMs < MIN_SUBMIT_ELAPSED_MS) {
    return "That went a little too fast — please try again.";
  }
  if (input.facultyName.trim() === "") return "Enter your name.";
  if (!isValidEmail(input.email)) return "Enter a valid email address.";
  if (input.department.trim() === "") return "Enter your department or academic program.";
  if (input.description.trim() === "") return "Briefly describe the proposed partnership.";
  if (isResearchType(input.partnershipType)) {
    if (input.researchTopic.trim() === "") return "Enter the topic or area of expertise.";
    if (input.researchSummary.trim() === "") return "Give a plain-language summary of the work.";
  }
  return null;
}

/** True when the honeypot was filled — the caller silently accepts and drops. */
export function isHoneypotTripped(honeypot: string): boolean {
  return honeypot.trim() !== "";
}
