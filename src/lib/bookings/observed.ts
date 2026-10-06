// Assumed versus observed — pure, no Supabase, no React.
// docs/bookings-design.md §20.8. A read-only view for the term report that sets
// what the packages assumed against what delivered projects confirmed, and
// lists the bookings WUWF refused or displaced by resource. It feeds nothing:
// utilization is never a pricing input (§20.1) — it informs a deliberate future
// capacity revision, and nothing else.

import { exactAmount } from "./economics";

export interface ObservedLine {
  kind: "package" | "labor" | "expense";
  package_id: string | null;
  label: string;
  quantity: number;
  /** What this project used (equal to the recipe unless adjusted). */
  labor_hours: Record<string, number>;
  resource_units: Record<string, number>;
  /** The standard recipe the package assumed, per unit. */
  recipe_labor_hours: Record<string, number> | null;
  recipe_resource_units: Record<string, number> | null;
}

export interface ConfirmedFigure {
  kind: "labor" | "units";
  /** A labor class id or a pool id, by kind. */
  id: string;
  planned: number;
  used: number;
}

export interface ObservedProject {
  id: string;
  lines: readonly ObservedLine[];
  /** Empty until production confirms what was used. */
  confirmed: readonly ConfirmedFigure[];
}

export interface BookingEventLike {
  pool_id: string | null;
  kind: "refused" | "released";
}

export interface AssumedObserved {
  /** Projects whose figures have been confirmed; the rest are not in any comparison. */
  confirmedProjects: number;
  labor: { classId: string; assumed: number; confirmed: number; projects: number }[];
  resources: { poolId: string; planned: number; used: number; projects: number }[];
  /** Per package, from the projects that had only that package so the hours can be attributed to it. */
  packages: { packageId: string; label: string; assumed: number; confirmed: number; projects: number }[];
  events: { poolId: string | null; refused: number; released: number }[];
}

/** What the package recipes assumed for a project: Σ quantity × the standard hours and units. */
export function assumedFor(lines: readonly ObservedLine[]): {
  labor: Record<string, number>;
  resources: Record<string, number>;
} {
  const labor: Record<string, number> = {};
  const resources: Record<string, number> = {};
  for (const line of lines) {
    if (line.kind !== "package") continue;
    for (const [id, hours] of Object.entries(line.recipe_labor_hours ?? {})) {
      labor[id] = exactAmount((labor[id] ?? 0) + Number(hours) * Number(line.quantity));
    }
    for (const [id, units] of Object.entries(line.recipe_resource_units ?? {})) {
      resources[id] = exactAmount((resources[id] ?? 0) + Number(units) * Number(line.quantity));
    }
  }
  return { labor, resources };
}

/**
 * Packages' assumed hours and units against what delivered projects confirmed,
 * and the bookings refused or released, by resource. Only projects with
 * confirmed figures are compared.
 */
export function assumedVersusObserved(
  projects: readonly ObservedProject[],
  events: readonly BookingEventLike[],
): AssumedObserved {
  const confirmed = projects.filter((project) => project.confirmed.length > 0);
  const labor = new Map<string, { assumed: number; confirmed: number; projects: number }>();
  const resources = new Map<string, { planned: number; used: number; projects: number }>();
  const packages = new Map<
    string,
    { label: string; assumed: number; confirmed: number; projects: number }
  >();

  for (const project of confirmed) {
    const assumed = assumedFor(project.lines);
    for (const figure of project.confirmed) {
      if (figure.kind === "labor") {
        const row = labor.get(figure.id) ?? { assumed: 0, confirmed: 0, projects: 0 };
        row.assumed = exactAmount(row.assumed + (assumed.labor[figure.id] ?? 0));
        row.confirmed = exactAmount(row.confirmed + Number(figure.used));
        row.projects += 1;
        labor.set(figure.id, row);
      } else {
        const row = resources.get(figure.id) ?? { planned: 0, used: 0, projects: 0 };
        row.planned = exactAmount(row.planned + (assumed.resources[figure.id] ?? 0));
        row.used = exactAmount(row.used + Number(figure.used));
        row.projects += 1;
        resources.set(figure.id, row);
      }
    }
    // Hours can be attributed to a package only when it was the project's one package.
    const packageLines = project.lines.filter((l) => l.kind === "package");
    if (packageLines.length === 1 && packageLines[0]!.package_id) {
      const line = packageLines[0]!;
      const row = packages.get(line.package_id!) ?? {
        label: line.label,
        assumed: 0,
        confirmed: 0,
        projects: 0,
      };
      row.assumed = exactAmount(
        row.assumed + Object.values(assumed.labor).reduce((total, h) => total + h, 0),
      );
      row.confirmed = exactAmount(
        row.confirmed +
          project.confirmed
            .filter((f) => f.kind === "labor")
            .reduce((total, f) => total + Number(f.used), 0),
      );
      row.projects += 1;
      packages.set(line.package_id!, row);
    }
  }

  const byPool = new Map<string | null, { refused: number; released: number }>();
  for (const event of events) {
    const row = byPool.get(event.pool_id) ?? { refused: 0, released: 0 };
    if (event.kind === "refused") row.refused += 1;
    else row.released += 1;
    byPool.set(event.pool_id, row);
  }

  return {
    confirmedProjects: confirmed.length,
    labor: [...labor.entries()].map(([classId, row]) => ({ classId, ...row })),
    resources: [...resources.entries()].map(([poolId, row]) => ({ poolId, ...row })),
    packages: [...packages.entries()].map(([packageId, row]) => ({ packageId, ...row })),
    events: [...byPool.entries()]
      .map(([poolId, row]) => ({ poolId, ...row }))
      .sort((a, b) => b.refused + b.released - (a.refused + a.released)),
  };
}

/** The planned figures a delivered project's confirmation is prefilled with: its lines' hours and units, as used. */
export function plannedFigures(lines: readonly ObservedLine[]): {
  labor: Record<string, number>;
  resources: Record<string, number>;
} {
  const labor: Record<string, number> = {};
  const resources: Record<string, number> = {};
  for (const line of lines) {
    for (const [id, hours] of Object.entries(line.labor_hours)) {
      labor[id] = exactAmount((labor[id] ?? 0) + Number(hours) * Number(line.quantity));
    }
    for (const [id, units] of Object.entries(line.resource_units)) {
      resources[id] = exactAmount((resources[id] ?? 0) + Number(units) * Number(line.quantity));
    }
  }
  return { labor, resources };
}
