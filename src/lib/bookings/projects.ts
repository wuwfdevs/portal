// A project's lifecycle — pure, no Supabase, no React. docs/bookings-design.md
// §2.3 (five stages and three dispositions), §3 (who does what) and §4 (the
// dashboard's "Needs your action"). bk_guard_project() in
// 20261006120000_bookings_projects.sql keeps the two privileged transitions
// (settled is Finance's; an override onto the reserve is the executive's);
// everything else here shapes the screens and is tested beside it.

import type { BadgeVariant } from "@/components/ui/badge";
import type {
  BkAirtimeHonoredIn,
  BkAirtimeTreatment,
  BkEditorialReview,
  BkEstimateLineKind,
  BkPartnerKind,
  BkProjectDisposition,
  BkProjectStage,
  BkProjectSource,
  BkRequested,
} from "@/lib/database.types";
import type { BookingsRole } from "./roles";

export const STAGES: readonly BkProjectStage[] = [
  "request",
  "estimate",
  "booked",
  "delivered",
  "settled",
];

export const STAGE_LABEL: Record<BkProjectStage, string> = {
  request: "Request",
  estimate: "Estimate",
  booked: "Booked",
  delivered: "Delivered",
  settled: "Settled",
};

export const DISPOSITIONS: readonly BkProjectDisposition[] = ["deferred", "declined", "withdrawn"];

export const DISPOSITION_LABEL: Record<BkProjectDisposition, string> = {
  deferred: "Deferred",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const DISPOSITION_BADGE: Record<BkProjectDisposition, BadgeVariant> = {
  deferred: "warning",
  declined: "danger",
  withdrawn: "muted",
};

export const REQUESTED_LABEL: Record<BkRequested, string> = {
  production: "Production",
  airtime: "Airtime",
  both: "Production and airtime",
};

export const PARTNER_KIND_LABEL: Record<BkPartnerKind, string> = {
  uwf_unit: "UWF unit",
  external: "Outside the university",
};

export const SOURCE_LABEL: Record<BkProjectSource, string> = {
  public: "Request form",
  staff: "Entered by staff",
};

export const EDITORIAL_REVIEW_LABEL: Record<BkEditorialReview, string> = {
  not_needed: "Not needed",
  needed: "Needed",
  cleared: "Cleared",
};

export const LINE_KIND_LABEL: Record<BkEstimateLineKind, string> = {
  package: "Service package",
  labor: "Labor hours",
  expense: "Direct expense",
};

export const AIRTIME_TREATMENT_LABEL: Record<BkAirtimeTreatment, string> = {
  contributed: "Contributed from the envelope",
  paid: "Paid",
};

export const HONORED_IN_LABEL: Record<BkAirtimeHonoredIn, string> = {
  pending: "Not yet placed",
  traffic: "Traffic",
  on_air: "On Air",
};

export function stageIndex(stage: BkProjectStage): number {
  return STAGES.indexOf(stage);
}

/** A project asks for production work: packages, dates, a production estimate. */
export function asksForProduction(requested: BkRequested): boolean {
  return requested !== "airtime";
}

/** A project asks for airtime: commitments honored in Traffic or On Air. */
export function asksForAirtime(requested: BkRequested): boolean {
  return requested !== "production";
}

// The estimate ------------------------------------------------------------------------------------------

export interface ProjectLike {
  id: string;
  title: string;
  stage: BkProjectStage;
  disposition: BkProjectDisposition | null;
  requested: BkRequested;
  estimate_sent_at: string | null;
  estimate_expires_at: string | null;
  estimate_approved_at: string | null;
  editorial_review: BkEditorialReview;
  event_ends_on: string | null;
  priced_as: string | null;
}

export type EstimateState =
  | { kind: "none" }
  | { kind: "sent"; expiresAt: string; daysLeft: number }
  | { kind: "expired"; expiredAt: string }
  | { kind: "approved"; approvedAt: string };

/** Where a project's estimate stands: not sent, out and holding dates, lapsed, or approved. */
export function estimateState(project: ProjectLike, nowISO: string): EstimateState {
  if (project.estimate_approved_at && stageIndex(project.stage) >= stageIndex("booked")) {
    return { kind: "approved", approvedAt: project.estimate_approved_at };
  }
  if (project.stage !== "estimate" || !project.estimate_sent_at) return { kind: "none" };
  const expiresAt = project.estimate_expires_at;
  if (!expiresAt) return { kind: "none" };
  const left = Date.parse(expiresAt) - Date.parse(nowISO);
  if (left <= 0) return { kind: "expired", expiredAt: expiresAt };
  return { kind: "sent", expiresAt, daysLeft: Math.ceil(left / 86_400_000) };
}

// Stage actions ---------------------------------------------------------------------------------------

export type StageAction =
  "send_estimate" | "resend_estimate" | "approve_estimate" | "mark_delivered";

export interface StageActionOption {
  action: StageAction;
  label: string;
  /** False with a reason when the action exists at this stage but can't run yet. */
  enabled: boolean;
  reason?: string;
}

export interface StageActionContext {
  roles: readonly BookingsRole[];
  hasLines: boolean;
  hasCommitments: boolean;
  isPriced: boolean;
  nowISO: string;
  /** Why the dates can't be held yet (the system's plan is an exception); blocks sending. */
  datesBlockedReason?: string;
}

function mayScheduleWith(roles: readonly BookingsRole[]): boolean {
  return roles.includes("production") || roles.includes("director") || roles.includes("executive");
}

/**
 * The stage actions this project offers now (§2.3): send the estimate from
 * `request` (or send it again from `estimate`), approve it to `booked`, mark
 * `booked` work delivered. Settling is Finance's, on the settlement panel (§21). A
 * closed project (any disposition) offers none; reopen it first.
 */
export function availableStageActions(
  project: ProjectLike,
  context: StageActionContext,
): StageActionOption[] {
  if (project.disposition !== null) return [];
  if (!mayScheduleWith(context.roles)) return [];
  const needsEstimate = asksForProduction(project.requested);
  const sendable = context.hasLines || context.hasCommitments;
  const sendReason = !sendable
    ? needsEstimate
      ? "Add at least one estimate line first."
      : "Add an airtime commitment first."
    : context.hasLines && !context.isPriced
      ? "Price the estimate first."
      : context.datesBlockedReason;
  switch (project.stage) {
    case "request":
      return [
        {
          action: "send_estimate",
          label: "Send the estimate",
          enabled: sendReason === undefined,
          reason: sendReason,
        },
      ];
    case "estimate": {
      const state = estimateState(project, context.nowISO);
      return [
        {
          action: "approve_estimate",
          label: "Partner approved — book it",
          enabled: state.kind === "sent" || state.kind === "expired",
          reason:
            state.kind === "sent" || state.kind === "expired"
              ? undefined
              : "Send the estimate first.",
        },
        {
          action: "resend_estimate",
          label: state.kind === "expired" ? "Send the estimate again" : "Re-send the estimate",
          enabled: sendReason === undefined,
          reason: sendReason,
        },
      ];
    }
    case "booked":
      return [{ action: "mark_delivered", label: "Mark delivered", enabled: true }];
    default:
      return [];
  }
}

/** Whether a disposition may be recorded at this stage: not once the work is delivered or settled. */
export function canSetDisposition(project: Pick<ProjectLike, "stage" | "disposition">): boolean {
  return (
    project.disposition === null && project.stage !== "delivered" && project.stage !== "settled"
  );
}

/** Null when valid; otherwise a sentence for the screen. Every disposition needs a reason (§2.3). */
export function validateDispositionInput(disposition: string, reason: string): string | null {
  if (!(DISPOSITIONS as readonly string[]).includes(disposition)) {
    return "That is not a disposition a project can have.";
  }
  if (reason.trim() === "") return "Give a reason — it shows on the project with the disposition.";
  return null;
}

// The request form -----------------------------------------------------------------------------------

export interface RequestFormValues {
  title: string;
  description: string;
  requested: string;
  partnerId: string;
  newPartnerName: string;
  newPartnerKind: string;
  eventStartsOn: string;
  eventEndsOn: string;
  deliverablesDueOn: string;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  fundingIndex: string;
  editorialReview: string;
  qualifiesStrategic: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TITLE_MAX = 160;

/** Null when valid; otherwise the first problem, as a sentence. */
export function validateRequestForm(values: RequestFormValues): string | null {
  if (values.title.trim() === "") return "Give the request a title.";
  if (values.title.trim().length > TITLE_MAX)
    return `Keep the title under ${TITLE_MAX} characters.`;
  if (!["production", "airtime", "both"].includes(values.requested)) {
    return "Say whether the request is for production, airtime, or both.";
  }
  const hasPartner = values.partnerId.trim() !== "";
  const hasNew = values.newPartnerName.trim() !== "";
  if (!hasPartner && !hasNew) return "Choose the partner, or name a new one.";
  if (hasPartner && hasNew) return "Choose an existing partner or name a new one, not both.";
  if (hasNew && !["uwf_unit", "external"].includes(values.newPartnerKind)) {
    return "Say whether the new partner is a UWF unit or outside the university.";
  }
  for (const [value, label] of [
    [values.eventStartsOn, "The first event date"],
    [values.eventEndsOn, "The last event date"],
    [values.deliverablesDueOn, "The deliverables date"],
  ] as const) {
    if (value !== "" && !DATE.test(value)) return `${label} must be a date.`;
  }
  if (values.eventStartsOn && values.eventEndsOn && values.eventEndsOn < values.eventStartsOn) {
    return "The event must end on or after the day it starts.";
  }
  if (values.contactEmail !== "" && !EMAIL.test(values.contactEmail.trim())) {
    return "The contact email doesn't look like an email address.";
  }
  if (!["not_needed", "needed", "cleared"].includes(values.editorialReview)) {
    return "Choose an editorial review state.";
  }
  if (!["", "yes", "no"].includes(values.qualifiesStrategic)) {
    return "Say whether the work qualifies as strategic, or leave it undecided.";
  }
  return null;
}

// The dashboard's action list ------------------------------------------------------------------------

export interface ActionItem {
  projectId: string;
  title: string;
  /** The role this is for; null means everyone with access. */
  role: BookingsRole | null;
  kind:
    | "estimate_needed"
    | "estimate_expiring"
    | "estimate_expired"
    | "confirm_delivery"
    | "settle"
    | "editorial_review";
  label: string;
}

/** Days before an estimate expires at which the dashboard starts saying so. */
export const EXPIRY_WARNING_DAYS = 3;

/**
 * "Needs your action" (§4): what each open project is waiting on, filtered
 * by the viewer's roles. A member with no role reads everything, so they
 * see every item; a member with roles sees their roles' items and the ones
 * for everyone. `todayISO` is the station's calendar date.
 */
export function actionItems(
  projects: readonly ProjectLike[],
  roles: readonly BookingsRole[],
  nowISO: string,
  todayISO: string,
): ActionItem[] {
  const items: ActionItem[] = [];
  for (const project of projects) {
    if (project.disposition !== null || project.stage === "settled") continue;
    const base = { projectId: project.id, title: project.title };
    if (project.editorial_review === "needed") {
      items.push({
        ...base,
        role: null,
        kind: "editorial_review",
        label: "Editorial review needed",
      });
    }
    if (project.stage === "request") {
      items.push({
        ...base,
        role: "production",
        kind: "estimate_needed",
        label: "Estimate needed",
      });
    } else if (project.stage === "estimate") {
      const state = estimateState(project, nowISO);
      if (state.kind === "expired") {
        items.push({
          ...base,
          role: "production",
          kind: "estimate_expired",
          label: "Estimate expired — send it again or close the request",
        });
      } else if (state.kind === "sent" && state.daysLeft <= EXPIRY_WARNING_DAYS) {
        items.push({
          ...base,
          role: "production",
          kind: "estimate_expiring",
          label: `Estimate expires in ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"}`,
        });
      }
    } else if (
      project.stage === "booked" &&
      project.event_ends_on !== null &&
      project.event_ends_on < todayISO
    ) {
      items.push({
        ...base,
        role: "production",
        kind: "confirm_delivery",
        label: "The event has passed — mark it delivered",
      });
    } else if (project.stage === "delivered") {
      items.push({
        ...base,
        role: "finance",
        kind: "settle",
        label: "Delivered — settle it at actual cost",
      });
    }
  }
  if (roles.length === 0) return items;
  return items.filter((item) => item.role === null || roles.includes(item.role));
}
