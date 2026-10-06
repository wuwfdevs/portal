// How an estimate line is built from a package — pure.
// docs/bookings-design.md §15 decision 2 (a line snapshots its package's
// parts, so a later version never changes what a sent estimate draws) and §18.1
// (one pass: the new-request form adds package lines the same way the add-line
// card does).

import type { BkEstimateLineKind } from "@/lib/database.types";

export interface PackageLike {
  id: string;
  name: string;
  unit_label: string;
  agreement_id: string | null;
  active: boolean;
  labor: { labor_class_id: string; hours: number }[];
  resources: { pool_id: string; units: number }[];
}

export interface NewLineRow {
  kind: BkEstimateLineKind;
  package_id: string | null;
  labor_class_id: string | null;
  label: string;
  unit_label: string;
  quantity: number;
  unit_rate: number;
  direct_cost: number | null;
  labor_hours: Record<string, number>;
  resource_units: Record<string, number>;
}

/** A package line, its rate to be written by pricing; its parts as the package has them now. */
export function packageLineRow(pkg: PackageLike, quantity: number): NewLineRow {
  return {
    kind: "package",
    package_id: pkg.id,
    labor_class_id: null,
    label: `${pkg.name} (${pkg.unit_label})`,
    unit_label: pkg.unit_label,
    quantity,
    unit_rate: 0,
    direct_cost: null,
    labor_hours: Object.fromEntries(pkg.labor.map((l) => [l.labor_class_id, l.hours])),
    resource_units: Object.fromEntries(pkg.resources.map((r) => [r.pool_id, r.units])),
  };
}

/** A package a request may take: active, and either general or scoped to the request's agreement. */
export function isOfferable(pkg: PackageLike, agreementId: string | null): boolean {
  return pkg.active && (pkg.agreement_id === null || pkg.agreement_id === agreementId);
}

export interface PackageSelection {
  packageId: string;
  quantity: number;
}

/**
 * The package picks a request form posted: a `pkg_<id>` checkbox and a
 * `qty_<id>` quantity each. An unticked package is ignored; a ticked one with
 * no usable quantity takes one. Null when a quantity is plainly wrong.
 */
export function parsePackageSelections(
  entries: Iterable<[string, string]>,
): { ok: true; selections: PackageSelection[] } | { ok: false; error: string } {
  const ticked: string[] = [];
  const quantities = new Map<string, string>();
  for (const [key, value] of entries) {
    if (key.startsWith("pkg_") && value) ticked.push(key.slice(4));
    else if (key.startsWith("qty_")) quantities.set(key.slice(4), value.trim());
  }
  const selections: PackageSelection[] = [];
  for (const packageId of ticked) {
    const raw = quantities.get(packageId) ?? "";
    const quantity = raw === "" ? 1 : Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: "A package's quantity must be more than zero." };
    }
    selections.push({ packageId, quantity });
  }
  return { ok: true, selections };
}

/** "Basic event webcast for UWF Libraries": the title a request gets when none was typed. */
export function defaultRequestTitle(packageNames: readonly string[], partnerName: string): string {
  const names = [...new Set(packageNames)];
  const what = names.length <= 2 ? names.join(" and ") : `${names[0]} and ${names.length - 1} more`;
  return `${what} for ${partnerName}`;
}
