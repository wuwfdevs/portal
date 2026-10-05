// Pure glue between a version's stored rows and the rate math: the pages and
// the snapshot writer both need "the card this version computes to" and must
// agree on it. No Supabase import, so it stays testable beside rates.ts.
import {
  buildRateCard,
  modelFromRows,
  packageSpecFromRow,
  type LaborClassLike,
  type LaborRateLike,
  type ModelFromRows,
  type PackageLike,
  type PackageSpec,
  type PoolCatalogLike,
  type PoolRowLike,
  type RateCard,
} from "./rates";

export interface VersionRowsLike {
  assumptions: Parameters<typeof modelFromRows>[0]["assumptions"];
  classes: LaborClassLike[];
  laborRates: LaborRateLike[];
  poolCatalog: PoolCatalogLike[];
  pools: PoolRowLike[];
  packages: PackageLike[];
}

export type VersionCard =
  | {
      ok: true;
      card: RateCard;
      specs: PackageSpec[];
      model: Extract<ModelFromRows, { ok: true }>["model"];
    }
  | { ok: false; missing: string[] };

/** The rate card a version's rows compute to, over its active packages only. */
export function cardForVersion(rows: VersionRowsLike): VersionCard {
  const model = modelFromRows(rows);
  if (!model.ok) return { ok: false, missing: model.missing };
  const specs = rows.packages.filter((pkg) => pkg.active).map(packageSpecFromRow);
  try {
    return { ok: true, card: buildRateCard(model.model, specs), specs, model: model.model };
  } catch (error) {
    return { ok: false, missing: [error instanceof Error ? error.message : String(error)] };
  }
}

/** A line's identity within a snapshot: the package id, or the labor class's key. */
export function snapshotLinesForCard(card: RateCard, versionId: string) {
  const packageLines = card.packages.map((line, index) => ({
    version_id: versionId,
    kind: "package" as const,
    package_id: line.key,
    labor_class_id: null,
    line_key: line.key,
    name: line.name,
    unit_label: line.unitLabel,
    strategic_rate: line.strategicRate,
    incremental_rate: line.incrementalRate,
    external_rate: line.externalRate,
    strategic_cost: line.strategicCost,
    incremental_cost: line.incrementalCost,
    external_grossed_cost: line.externalGrossedCost,
    market_floor: line.marketFloor,
    sort_order: index,
  }));
  const laborLines = card.labor.map((line, index) => ({
    version_id: versionId,
    kind: "labor" as const,
    package_id: null,
    labor_class_id: line.laborClassId,
    line_key: line.key,
    name: line.name,
    unit_label: line.unitLabel,
    strategic_rate: null,
    incremental_rate: line.internalRate,
    external_rate: line.externalRate,
    strategic_cost: null,
    incremental_cost: null,
    external_grossed_cost: null,
    market_floor: null,
    sort_order: packageLines.length + index,
  }));
  return [...packageLines, ...laborLines];
}

/**
 * Whether a stored snapshot still says what the rows now compute: same
 * lines, same three rates. Used to offer "Record for estimates" only when
 * the snapshot is missing or stale.
 */
export function snapshotMatchesCard(
  snapshot: readonly {
    line_key: string;
    strategic_rate: number | null;
    incremental_rate: number | null;
    external_rate: number;
  }[],
  card: RateCard,
): boolean {
  const expected = new Map<string, [number | null, number, number]>();
  for (const line of card.packages) {
    expected.set(line.key, [line.strategicRate, line.incrementalRate, line.externalRate]);
  }
  for (const line of card.labor) {
    expected.set(line.key, [null, line.internalRate, line.externalRate]);
  }
  if (snapshot.length !== expected.size) return false;
  const same = (a: number | null, b: number | null) =>
    a === null || b === null ? a === b : Number(a) === Number(b);
  return snapshot.every((line) => {
    const want = expected.get(line.line_key);
    return (
      want !== undefined &&
      same(line.strategic_rate, want[0]) &&
      same(line.incremental_rate, want[1]) &&
      same(line.external_rate, want[2])
    );
  });
}
