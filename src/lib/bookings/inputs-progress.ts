// The Inputs checklist's rows — pure. One row per editor that feeds the rate card,
// each with how many of its validated inputs are done (docs/bookings-design.md §23).
// Packages carry no validation state, so their row counts packages instead.

import type { ValidationState } from "./rates";
import { ratesHref, type RatesSection } from "./paths";

export interface InputsRow {
  section: RatesSection;
  label: string;
  description: string;
  href: string;
  /** Rows still awaiting validation; null where the editor has no validation. */
  pending: number | null;
  total: number;
}

interface Validated {
  validationState: ValidationState;
}

function count(rows: readonly Validated[]): { pending: number; total: number } {
  return {
    pending: rows.filter((row) => row.validationState === "pending").length,
    total: rows.length,
  };
}

export function buildInputsRows(
  versionId: string,
  parts: {
    assumptions: readonly Validated[];
    labor: readonly Validated[];
    pools: readonly Validated[];
    packages: number;
  },
): InputsRow[] {
  const href = (section: RatesSection) => ratesHref(section, versionId);
  return [
    {
      section: "assumptions",
      label: "Assumptions",
      description: "Overhead, margin, assessment, rounding and the sourced cost inputs",
      href: href("assumptions"),
      ...count(parts.assumptions),
    },
    {
      section: "labor",
      label: "Labor",
      description: "Pay figures for each labor class",
      href: href("labor"),
      ...count(parts.labor),
    },
    {
      section: "pools",
      label: "Resource pools",
      description: "Cost lines and units for each pool",
      href: href("pools"),
      ...count(parts.pools),
    },
    {
      section: "packages",
      label: "Service packages",
      description: "Hours, units and market floor for each package",
      href: href("packages"),
      pending: null,
      total: parts.packages,
    },
  ];
}

/** "[n] of [N] validated", "All [N] validated", or "[N] packages". */
export function progressLabel(row: Pick<InputsRow, "pending" | "total" | "section">): string {
  if (row.pending === null) return `${row.total} ${row.total === 1 ? "package" : "packages"}`;
  if (row.total === 0) return "Nothing yet";
  if (row.pending === 0) return `All ${row.total} validated`;
  return `${row.total - row.pending} of ${row.total} validated`;
}
