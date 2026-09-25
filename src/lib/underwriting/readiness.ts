// The "ready to activate?" checklist a draft contract shows (the reviewed
// contract-page mockup, 2026-09-25). Pure, tested: given what the contract
// page already reads, says which of the five setup steps are done, which
// need a look, and which are missing — and never blocks activation, since
// a warning (unapproved copy, a stated total that disagrees) is a fact to
// see, not a gate.

export type ReadinessState = "ok" | "warn" | "missing";

export interface ReadinessItem {
  key: "order" | "agreement" | "schedule" | "copy" | "policy";
  state: ReadinessState;
  title: string;
  detail: string;
}

export interface ReadinessInput {
  contractIdentifier: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sponsorshipTotal: number | null;
  hasAgreement: boolean;
  /** Active lines under the revision that would schedule. */
  lineCount: number;
  /** What those lines compile to. */
  expectedTotal: number;
  statedTotalSpots: number | null;
  copyLinked: number;
  copyApproved: number;
  /** The order printed a separation rule nobody has turned into a policy. */
  separationUndecided: boolean;
  affidavitRequired: boolean;
  makegoodRequiresAgencyApproval: boolean;
  preemptionPolicy: string | null;
}

export function computeReadiness(input: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];

  const orderOk = input.contractIdentifier.trim() !== "" && input.effectiveFrom !== "";
  items.push({
    key: "order",
    state: orderOk ? "ok" : "missing",
    title: "Order details",
    detail: orderOk
      ? `${input.contractIdentifier} · ${input.effectiveFrom}${input.effectiveTo ? ` – ${input.effectiveTo}` : " (open-ended)"}${input.sponsorshipTotal != null ? ` · $${input.sponsorshipTotal.toLocaleString()}` : ""}`
      : "Underwriter, order number and run dates.",
  });

  items.push({
    key: "agreement",
    state: input.hasAgreement ? "ok" : "warn",
    title: input.hasAgreement ? "Executed agreement attached" : "No executed agreement attached",
    detail: input.hasAgreement
      ? "Stored with the contract."
      : "Attach the signed order so the lines can be checked against it.",
  });

  if (input.lineCount === 0) {
    items.push({
      key: "schedule",
      state: "missing",
      title: "No schedule lines yet",
      detail: "Enter one line per instruction the order prints.",
    });
  } else {
    const mismatch =
      input.statedTotalSpots != null && input.statedTotalSpots !== input.expectedTotal;
    items.push({
      key: "schedule",
      state: mismatch ? "warn" : "ok",
      title: `Schedule entered · ${input.lineCount} line${input.lineCount === 1 ? "" : "s"} compile to ${input.expectedTotal} credit${input.expectedTotal === 1 ? "" : "s"}`,
      detail: mismatch
        ? `The order says ${input.statedTotalSpots} spots — check the lines against it before activating.`
        : input.statedTotalSpots != null
          ? `Matches the ${input.statedTotalSpots} spots on the order.`
          : "No total printed on the order to check against.",
    });
  }

  if (input.copyLinked === 0) {
    items.push({
      key: "copy",
      state: "missing",
      title: "No copy linked",
      detail: "Nothing can be placed until an approved message is linked to the contract.",
    });
  } else {
    const pending = input.copyLinked - input.copyApproved;
    items.push({
      key: "copy",
      state: input.copyApproved === 0 ? "warn" : pending > 0 ? "warn" : "ok",
      title: `Copy · ${input.copyLinked} message${input.copyLinked === 1 ? "" : "s"} linked${pending > 0 ? `, ${pending} awaiting approval` : ""}`,
      detail:
        input.copyApproved === 0
          ? "None is approved yet. You can activate now; nothing places until one is."
          : pending > 0
            ? "You can activate now; auto-fill only rotates approved copy until the rest are."
            : "Every linked message is approved.",
    });
  }

  const policyBits = [
    input.affidavitRequired ? "affidavit required" : "no affidavit",
    input.makegoodRequiresAgencyApproval
      ? "makegoods need agency approval"
      : "makegoods at the station's discretion",
    input.separationUndecided ? "separation rule not yet decided" : "separation decided",
    input.preemptionPolicy
      ? `preemptions: ${input.preemptionPolicy}`
      : "no preemption policy recorded",
  ];
  items.push({
    key: "policy",
    state: input.separationUndecided ? "warn" : "ok",
    title: input.separationUndecided ? "Traffic policy needs a decision" : "Traffic policy decided",
    detail: `${policyBits.join(" · ")}.${input.separationUndecided ? " Auto-fill waits until the separation rule is chosen." : ""}`,
  });

  return items;
}

export function countReady(items: ReadinessItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.state === "ok").length, total: items.length };
}
