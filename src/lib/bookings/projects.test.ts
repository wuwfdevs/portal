import { describe, expect, it } from "vitest";
import {
  actionItems,
  availableStageActions,
  canSetDisposition,
  estimateState,
  validateDispositionInput,
  validateRequestForm,
  type ProjectLike,
  type RequestFormValues,
} from "./projects";

const NOW = "2027-02-01T15:00:00.000Z";
const TODAY = "2027-02-01";

function project(overrides: Partial<ProjectLike> = {}): ProjectLike {
  return {
    id: "p1",
    title: "Board of Trustees webcast",
    stage: "request",
    disposition: null,
    requested: "production",
    estimate_sent_at: null,
    estimate_expires_at: null,
    estimate_approved_at: null,
    editorial_review: "not_needed",
    event_ends_on: null,
    priced_as: null,
    ...overrides,
  };
}

const sent = () =>
  project({
    stage: "estimate",
    estimate_sent_at: "2027-01-25T15:00:00.000Z",
    estimate_expires_at: "2027-02-08T15:00:00.000Z",
    priced_as: "incremental",
  });

describe("estimateState", () => {
  it("is none before an estimate is sent", () => {
    expect(estimateState(project(), NOW)).toEqual({ kind: "none" });
  });
  it("counts the days left on a sent estimate", () => {
    expect(estimateState(sent(), NOW)).toEqual({
      kind: "sent",
      expiresAt: "2027-02-08T15:00:00.000Z",
      daysLeft: 7,
    });
  });
  it("is expired once the expiry has passed", () => {
    expect(estimateState(sent(), "2027-02-09T00:00:00.000Z")).toEqual({
      kind: "expired",
      expiredAt: "2027-02-08T15:00:00.000Z",
    });
  });
  it("is approved once booked", () => {
    const booked = project({
      stage: "booked",
      estimate_sent_at: NOW,
      estimate_approved_at: "2027-02-02T10:00:00.000Z",
    });
    expect(estimateState(booked, NOW)).toEqual({
      kind: "approved",
      approvedAt: "2027-02-02T10:00:00.000Z",
    });
  });
});

describe("availableStageActions", () => {
  const base = {
    roles: ["production" as const],
    hasLines: true,
    hasCommitments: false,
    isPriced: true,
    nowISO: NOW,
  };

  it("offers nothing to a member without a scheduling role", () => {
    expect(availableStageActions(project(), { ...base, roles: [] })).toEqual([]);
    expect(availableStageActions(project(), { ...base, roles: ["finance"] })).toEqual([]);
  });
  it("offers nothing on a closed project", () => {
    expect(availableStageActions(project({ disposition: "deferred" }), base)).toEqual([]);
  });
  it("lets a request's estimate be sent once it has priced lines", () => {
    expect(availableStageActions(project(), base)).toEqual([
      { action: "send_estimate", label: "Send the estimate", enabled: true, reason: undefined },
    ]);
    expect(availableStageActions(project(), { ...base, hasLines: false })[0]).toMatchObject({
      enabled: false,
      reason: "Add at least one estimate line first.",
    });
    expect(availableStageActions(project(), { ...base, isPriced: false })[0]).toMatchObject({
      enabled: false,
      reason: "Price the estimate first.",
    });
  });
  it("blocks sending while the system's dates are an exception, and says why", () => {
    expect(
      availableStageActions(project(), { ...base, datesBlockedReason: "Pick a date first." })[0],
    ).toMatchObject({ enabled: false, reason: "Pick a date first." });
  });
  it("lets an airtime-only request go out with a commitment and no lines", () => {
    const airtime = project({ requested: "airtime" });
    expect(
      availableStageActions(airtime, {
        ...base,
        hasLines: false,
        hasCommitments: true,
        isPriced: false,
      })[0],
    ).toMatchObject({ enabled: true });
    expect(
      availableStageActions(airtime, { ...base, hasLines: false, hasCommitments: false })[0],
    ).toMatchObject({
      enabled: false,
      reason: "Add an airtime commitment first.",
    });
  });
  it("offers approve and re-send on a sent estimate, and names an expired one", () => {
    expect(availableStageActions(sent(), base).map((a) => a.action)).toEqual([
      "approve_estimate",
      "resend_estimate",
    ]);
    const later = { ...base, nowISO: "2027-02-20T00:00:00.000Z" };
    expect(availableStageActions(sent(), later)[1]).toMatchObject({
      label: "Send the estimate again",
      enabled: true,
    });
  });
  it("offers mark delivered when booked and nothing after", () => {
    expect(availableStageActions(project({ stage: "booked" }), base)).toEqual([
      { action: "mark_delivered", label: "Mark delivered", enabled: true },
    ]);
    expect(availableStageActions(project({ stage: "delivered" }), base)).toEqual([]);
  });
});

describe("dispositions", () => {
  it("may be set until the work is delivered", () => {
    expect(canSetDisposition(project())).toBe(true);
    expect(canSetDisposition(project({ stage: "booked" }))).toBe(true);
    expect(canSetDisposition(project({ stage: "delivered" }))).toBe(false);
    expect(canSetDisposition(project({ disposition: "declined" }))).toBe(false);
  });
  it("always needs a reason", () => {
    expect(validateDispositionInput("declined", "")).toMatch(/reason/);
    expect(validateDispositionInput("archived", "x")).toMatch(/not a disposition/);
    expect(validateDispositionInput("withdrawn", "Unit pulled out")).toBeNull();
  });
});

describe("validateRequestForm", () => {
  const values: RequestFormValues = {
    title: "Coaches' show",
    description: "",
    requested: "both",
    partnerId: "partner-1",
    newPartnerName: "",
    newPartnerKind: "",
    eventStartsOn: "2027-03-01",
    eventEndsOn: "2027-03-01",
    deliverablesDueOn: "",
    location: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    fundingIndex: "",
    editorialReview: "not_needed",
    qualifiesStrategic: "",
  };
  it("accepts a complete form", () => {
    expect(validateRequestForm(values)).toBeNull();
  });
  it("needs a title and a partner", () => {
    expect(validateRequestForm({ ...values, title: " " })).toMatch(/title/);
    expect(validateRequestForm({ ...values, partnerId: "" })).toMatch(/partner/);
    expect(validateRequestForm({ ...values, newPartnerName: "Athletics" })).toMatch(/not both/);
    expect(validateRequestForm({ ...values, partnerId: "", newPartnerName: "Athletics" })).toMatch(
      /UWF unit or outside/,
    );
    expect(
      validateRequestForm({
        ...values,
        partnerId: "",
        newPartnerName: "Athletics",
        newPartnerKind: "uwf_unit",
      }),
    ).toBeNull();
  });
  it("checks dates and the email", () => {
    expect(validateRequestForm({ ...values, eventEndsOn: "2027-02-28" })).toMatch(
      /end on or after/,
    );
    expect(validateRequestForm({ ...values, deliverablesDueOn: "soon" })).toMatch(/must be a date/);
    expect(validateRequestForm({ ...values, contactEmail: "nope" })).toMatch(/email/);
  });
});

describe("actionItems", () => {
  const projects: ProjectLike[] = [
    project({ id: "a", title: "A", stage: "request" }),
    { ...sent(), id: "b", title: "B", estimate_expires_at: "2027-02-03T15:00:00.000Z" },
    { ...sent(), id: "c", title: "C", estimate_expires_at: "2027-01-31T15:00:00.000Z" },
    project({ id: "d", title: "D", stage: "booked", event_ends_on: "2027-01-20" }),
    project({ id: "e", title: "E", stage: "booked", event_ends_on: "2027-03-20" }),
    project({ id: "f", title: "F", stage: "request", editorial_review: "needed" }),
    project({ id: "g", title: "G", stage: "request", disposition: "deferred" }),
    project({ id: "h", title: "H", stage: "settled" }),
  ];

  it("lists what each open project waits on", () => {
    const kinds = actionItems(projects, [], NOW, TODAY).map(
      (item) => `${item.projectId}:${item.kind}`,
    );
    expect(kinds).toEqual([
      "a:estimate_needed",
      "b:estimate_expiring",
      "c:estimate_expired",
      "d:confirm_delivery",
      "f:editorial_review",
      "f:estimate_needed",
    ]);
  });
  it("filters by the viewer's roles, keeping everyone's items", () => {
    const finance = actionItems(projects, ["finance"], NOW, TODAY);
    expect(finance.map((item) => item.kind)).toEqual(["editorial_review"]);
    const production = actionItems(projects, ["production"], NOW, TODAY);
    expect(production).toHaveLength(6);
  });
});
