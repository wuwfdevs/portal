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

/**
 * One or two plain sentences explaining what each track actually involves —
 * shown next to its checkbox on the public form's "choose your track(s)"
 * step, per the brief's "present minimal contextual information needed for
 * submitters to understand the questions." A submitter should never have to
 * guess what "station immersion" means.
 */
export const PARTNERSHIP_TYPE_DESCRIPTION: Record<ApPartnershipType, string> = {
  classroom_visit:
    "A WUWF staff member visits your class to give a presentation, run a workshop, or lead a discussion.",
  station_immersion:
    "Your class visits WUWF for a tour, a production demonstration, and an introduction to how the station works.",
  applied_project:
    "Your students complete a defined reporting, production, research, or promotional project connected to WUWF.",
  internship_practicum:
    "One or more students work within a WUWF function — reporting, production, promotion — under staff supervision.",
  faculty_research:
    "You have research, scholarship, or subject-matter expertise that could inform WUWF's reporting or public programming.",
  other: "Something else — tell us what you have in mind.",
};

/** Whether this track is on the research/expertise path rather than the teaching path. */
export function isResearchType(type: ApPartnershipType): boolean {
  return type === "faculty_research";
}

/** Whether course fields make sense to ask for — teaching-and-student-engagement tracks only. */
export function isCourseBasedType(type: ApPartnershipType): boolean {
  return type === "classroom_visit" || type === "station_immersion" || type === "applied_project";
}

/** Whether the research & expertise follow-up step should appear, given the tracks chosen so far. */
export function hasResearchTrack(types: ApPartnershipType[]): boolean {
  return types.some(isResearchType);
}

/** Whether the course-details fields should appear within the shared "tell us more" step. */
export function hasCourseBasedTrack(types: ApPartnershipType[]): boolean {
  return types.some(isCourseBasedType);
}

/** Whether at least one non-research track was chosen — the general "tell us more" step applies whenever this or the research step does. */
export function hasNonResearchTrack(types: ApPartnershipType[]): boolean {
  return types.some((type) => !isResearchType(type));
}

export interface InquiryInput {
  facultyName: string;
  email: string;
  department: string;
  description: string;
  partnershipTypes: ApPartnershipType[];
  researchTopic: string;
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
  if (input.partnershipTypes.length === 0) return "Choose at least one collaboration track.";
  if (input.description.trim() === "") return "Briefly describe the proposed partnership.";
  if (hasResearchTrack(input.partnershipTypes)) {
    if (input.researchTopic.trim() === "") return "Enter the topic or area of expertise.";
  }
  return null;
}

/** True when the honeypot was filled — the caller silently accepts and drops. */
export function isHoneypotTripped(honeypot: string): boolean {
  return honeypot.trim() !== "";
}
