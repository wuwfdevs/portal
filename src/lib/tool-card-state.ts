import type { ToolStatus } from "@/lib/database.types";

export type ToolCardMode = "open" | "restricted" | "unavailable" | "hidden";

export interface ToolCardState {
  mode: ToolCardMode;
  statusLabel: string;
  actionLabel: string | null;
}

const STATUS_LABEL: Record<ToolStatus, string> = {
  available: "Available",
  in_development: "In development",
  planned: "Planned",
  proposed: "Proposed",
};

/**
 * Pure derivation of what a dashboard tool card should show, kept separate
 * from components/tool-card.tsx so the state matrix (available/restricted/
 * in_development/planned/proposed x access) is unit-testable without rendering.
 */
export function getToolCardState(status: ToolStatus, hasAccess: boolean): ToolCardState {
  // A proposed tool is an idea someone filed on the Roadmap, not software.
  // listToolsForCurrentUser already filters these out; saying so here too puts
  // the rule somewhere a test can read it, and keeps the fall-through below
  // from quietly labelling a proposal "In development".
  if (status === "proposed") {
    return { mode: "hidden", statusLabel: STATUS_LABEL.proposed, actionLabel: null };
  }
  if (status === "available" && hasAccess) {
    return { mode: "open", statusLabel: STATUS_LABEL.available, actionLabel: "Open Tool" };
  }
  if (status === "available" && !hasAccess) {
    return { mode: "restricted", statusLabel: "Restricted", actionLabel: null };
  }
  if (status === "planned") {
    return { mode: "unavailable", statusLabel: STATUS_LABEL.planned, actionLabel: "Coming later" };
  }
  return { mode: "unavailable", statusLabel: STATUS_LABEL.in_development, actionLabel: "Learn more" };
}
