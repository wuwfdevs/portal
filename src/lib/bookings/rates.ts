// The rate math behind Bookings' rate card — pure, no Supabase, no React.
// See docs/bookings-design.md §5 and §7. The v0.1 workbook
// (WUWF_Production_Rate_Model_v0.1.xlsx) is this module's test fixture:
// every cost and every card figure in rates.test.ts must reproduce from the
// inputs here, and SQL never computes a price.
//
// Labor classes and resource pools are data, not names in this file (slice
// 2b): the workbook's one professional and one student are two classes, and
// its four pools plus webcasting are five pools. The model, in the
// workbook's own order:
//   labor       — a salaried class's loaded hourly = salary × (1 + load) ÷
//                 paid hours; an hourly class's = wage × (1 + load)
//   pools       — the shared production resource pool (the budget lines
//                 flagged as part of it, summed) is split across the
//                 `allocated` pools by allocation share; an `own_lines` pool
//                 (webcasting) is costed from its own lines. Each pool's cost
//                 per unit is its annual cost ÷ its available units
//   packages    — strategic cost = resource units + the hours of every class
//                 charged in a strategic price (students); incremental cost
//                 adds the hours of the classes that are not (professionals,
//                 baseline-funded); the external floor grosses incremental up
//                 for the target margin and the university assessment
//   card        — every rate rounds UP to the next $25; external is the higher
//                 of the grossed-up floor and the package's market floor

export type PayBasis = "salaried" | "hourly";
export type PoolCosting = "allocated" | "own_lines";

/** The two model inputs the rate math still reads directly from bk_assumptions. */
export const MODEL_INPUT_KEYS = ["external_margin_share", "assessment_share"] as const;
export type ModelInputKey = (typeof MODEL_INPUT_KEYS)[number];

export const MODEL_INPUT_LABEL: Record<ModelInputKey, string> = {
  external_margin_share: "External target contribution margin",
  assessment_share: "New Ventures administrative assessment",
};

export function isModelInputKey(value: string): value is ModelInputKey {
  return (MODEL_INPUT_KEYS as readonly string[]).includes(value);
}

export interface LaborClassInput {
  id: string;
  key: string;
  name: string;
  payBasis: PayBasis;
  annualSalary: number | null;
  hourlyWage: number | null;
  loadShare: number;
  paidHours: number | null;
  /** The planning rate on the card for this class's hours beyond a package. */
  externalRate: number;
  /** Whether this class's hours are charged in a strategic (baseline-funded) price. */
  chargedInStrategic: boolean;
}

export interface PoolInput {
  id: string;
  key: string;
  name: string;
  unitLabel: string;
  costing: PoolCosting;
  /** Allocated pools: this pool's share of the shared production pool. */
  allocationShare: number | null;
  availableUnits: number;
  /** Own-lines pools: the annual dollars of each of their budget lines. */
  ownLines: number[];
}

export interface RateModelInputs {
  externalMarginShare: number;
  assessmentShare: number;
  /** Annual dollars of each budget line in the shared production resource pool. */
  sharedPoolLines: number[];
  labor: LaborClassInput[];
  pools: PoolInput[];
}

export interface LaborDerived extends LaborClassInput {
  loadedHourly: number;
}

export interface PoolDerived extends PoolInput {
  annualCost: number;
  costPerUnit: number;
}

export interface DerivedMetrics {
  sharedPoolAnnual: number;
  labor: LaborDerived[];
  pools: PoolDerived[];
}

export interface PackageSpec {
  key: string;
  name: string;
  unitLabel: string;
  /** Hours per labor class id. */
  labor: Record<string, number>;
  /** Units per pool id. */
  resources: Record<string, number>;
  marketFloor: number;
}

export interface PackageCosts {
  strategicCost: number;
  incrementalCost: number;
  /** Incremental cost grossed up for margin and assessment, before the market floor and rounding. */
  externalGrossedCost: number;
  strategicRate: number;
  incrementalRate: number;
  externalRate: number;
}

export const RATE_CARD_STEP = 25;

/** Round to cents. The EPSILON nudge keeps 154.505 from landing on 154.50. */
export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The card's own rounding: up to the next multiple of `step` (a figure already on a step stays). */
export function roundUpTo(value: number, step = RATE_CARD_STEP): number {
  if (step <= 0) throw new Error("step must be positive");
  const cents = Math.round((value + Number.EPSILON) * 100);
  const stepCents = Math.round(step * 100);
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** A class's loaded hourly cost from its pay basis. */
export function loadedHourly(labor: LaborClassInput): number {
  if (labor.payBasis === "salaried") {
    if (!labor.annualSalary || !labor.paidHours || labor.paidHours <= 0) {
      throw new Error(`${labor.name} needs an annual salary and paid hours`);
    }
    return (labor.annualSalary * (1 + labor.loadShare)) / labor.paidHours;
  }
  if (labor.hourlyWage === null || labor.hourlyWage === undefined) {
    throw new Error(`${labor.name} needs an hourly wage`);
  }
  return labor.hourlyWage * (1 + labor.loadShare);
}

export function computeDerived(model: RateModelInputs): DerivedMetrics {
  const sharedPoolAnnual = sum(model.sharedPoolLines);
  const pools = model.pools.map((pool) => {
    if (pool.availableUnits <= 0) throw new Error(`${pool.name} must have available units`);
    const annualCost =
      pool.costing === "allocated"
        ? sharedPoolAnnual * (pool.allocationShare ?? 0)
        : sum(pool.ownLines);
    return { ...pool, annualCost, costPerUnit: annualCost / pool.availableUnits };
  });
  return {
    sharedPoolAnnual,
    labor: model.labor.map((labor) => ({ ...labor, loadedHourly: loadedHourly(labor) })),
    pools,
  };
}

/** The share of an external price left after the target margin and the assessment. */
export function externalNetShare(
  inputs: Pick<RateModelInputs, "externalMarginShare" | "assessmentShare">,
): number {
  const share = 1 - inputs.externalMarginShare - inputs.assessmentShare;
  if (share <= 0) throw new Error("Margin and assessment leave nothing of an external price");
  return share;
}

export function pricePackage(
  spec: PackageSpec,
  derived: DerivedMetrics,
  inputs: Pick<RateModelInputs, "externalMarginShare" | "assessmentShare">,
): PackageCosts {
  let resourceCost = 0;
  for (const [poolId, units] of Object.entries(spec.resources)) {
    if (units === 0) continue;
    const pool = derived.pools.find((candidate) => candidate.id === poolId);
    if (!pool) throw new Error(`${spec.name} uses a pool this version has no figures for`);
    resourceCost += units * pool.costPerUnit;
  }
  let chargedLabor = 0;
  let baselineLabor = 0;
  for (const [classId, hours] of Object.entries(spec.labor)) {
    if (hours === 0) continue;
    const labor = derived.labor.find((candidate) => candidate.id === classId);
    if (!labor) throw new Error(`${spec.name} uses a labor class this version has no rate for`);
    if (labor.chargedInStrategic) chargedLabor += hours * labor.loadedHourly;
    else baselineLabor += hours * labor.loadedHourly;
  }
  const strategicCost = resourceCost + chargedLabor;
  const incrementalCost = strategicCost + baselineLabor;
  const externalGrossedCost = incrementalCost / externalNetShare(inputs);

  return {
    strategicCost: roundCents(strategicCost),
    incrementalCost: roundCents(incrementalCost),
    externalGrossedCost: roundCents(externalGrossedCost),
    strategicRate: roundUpTo(strategicCost),
    incrementalRate: roundUpTo(incrementalCost),
    externalRate: Math.max(roundUpTo(externalGrossedCost), spec.marketFloor),
  };
}

export interface LaborLine {
  /** The labor class's key. */
  key: string;
  laborClassId: string;
  name: string;
  unitLabel: "hour";
  internalRate: number;
  externalRate: number;
  treatment: string;
}

export interface RateCard {
  derived: DerivedMetrics;
  packages: (PackageSpec & PackageCosts)[];
  labor: LaborLine[];
}

export function buildRateCard(model: RateModelInputs, packages: readonly PackageSpec[]): RateCard {
  const derived = computeDerived(model);
  return {
    derived,
    packages: packages.map((spec) => ({ ...spec, ...pricePackage(spec, derived, model) })),
    labor: derived.labor.map((labor) => ({
      key: labor.key,
      laborClassId: labor.id,
      name: labor.chargedInStrategic ? `${labor.name} labor` : `${labor.name} beyond the envelope`,
      unitLabel: "hour",
      internalRate: roundCents(labor.loadedHourly),
      externalRate: labor.externalRate,
      treatment: labor.chargedInStrategic
        ? "Recover when incremental"
        : "Recover outside the baseline institutional envelope",
    })),
  };
}

// Sensitivity ---------------------------------------------------------------------
// "What moves the price most": re-run the model with one figure moved and
// report the change in each package's incremental cost, so validation effort
// goes where it changes the card. Advisory; nothing stores it.

export type SensitivityMove =
  | { kind: "labor_load"; targetId: string; label: string; delta: number; moveLabel: string }
  | { kind: "labor_pay"; targetId: string; label: string; delta: number; moveLabel: string }
  | { kind: "pool_units"; targetId: string; label: string; delta: number; moveLabel: string };

/** One move per figure worth questioning: each class's load and pay, each own-lines pool's volume. */
export function defaultSensitivityMoves(model: RateModelInputs): SensitivityMove[] {
  const moves: SensitivityMove[] = [];
  for (const labor of model.labor) {
    moves.push({
      kind: "labor_load",
      targetId: labor.id,
      label: `${labor.name} load`,
      delta: 0.1,
      moveLabel: "+10 pts",
    });
    moves.push(
      labor.payBasis === "salaried"
        ? {
            kind: "labor_pay",
            targetId: labor.id,
            label: `${labor.name} salary`,
            delta: 5000,
            moveLabel: "+$5,000",
          }
        : {
            kind: "labor_pay",
            targetId: labor.id,
            label: `${labor.name} wage`,
            delta: 1,
            moveLabel: "+$1 / hr",
          },
    );
  }
  for (const pool of model.pools) {
    if (pool.costing !== "own_lines") continue;
    const delta = -Math.max(1, Math.round(pool.availableUnits * 0.25));
    moves.push({
      kind: "pool_units",
      targetId: pool.id,
      label: `${pool.name} volume`,
      delta,
      moveLabel: `${delta} ${pool.unitLabel}s`,
    });
  }
  return moves;
}

export function applyMove(model: RateModelInputs, move: SensitivityMove): RateModelInputs {
  if (move.kind === "pool_units") {
    return {
      ...model,
      pools: model.pools.map((pool) =>
        pool.id === move.targetId
          ? { ...pool, availableUnits: pool.availableUnits + move.delta }
          : pool,
      ),
    };
  }
  return {
    ...model,
    labor: model.labor.map((labor) => {
      if (labor.id !== move.targetId) return labor;
      if (move.kind === "labor_load") return { ...labor, loadShare: labor.loadShare + move.delta };
      return labor.payBasis === "salaried"
        ? { ...labor, annualSalary: (labor.annualSalary ?? 0) + move.delta }
        : { ...labor, hourlyWage: (labor.hourlyWage ?? 0) + move.delta };
    }),
  };
}

export interface SensitivityRow {
  move: SensitivityMove;
  /** Change in incremental cost per package key, in dollars (positive = dearer). */
  deltas: Record<string, number>;
  /** The largest absolute change across packages. */
  largest: number;
}

export function sensitivity(
  model: RateModelInputs,
  packages: readonly PackageSpec[],
  moves: readonly SensitivityMove[] = defaultSensitivityMoves(model),
): SensitivityRow[] {
  const base = buildRateCard(model, packages);
  const rows = moves.flatMap((move) => {
    let card: RateCard;
    try {
      card = buildRateCard(applyMove(model, move), packages);
    } catch {
      return [];
    }
    const deltas: Record<string, number> = {};
    let largest = 0;
    card.packages.forEach((pkg, index) => {
      const delta = roundCents(pkg.incrementalCost - base.packages[index]!.incrementalCost);
      deltas[pkg.key] = delta;
      largest = Math.max(largest, Math.abs(delta));
    });
    return [{ move, deltas, largest }];
  });
  return rows.sort((a, b) => b.largest - a.largest);
}

// Adoption gate --------------------------------------------------------------------
// A version can be submitted (and so adopted) only when nothing on it still
// awaits validation. `accepted_as_is` is Finance's explicit "we know, and we
// are going with it" — it counts as resolved, with its note on the row.

export type ValidationState = "pending" | "validated" | "accepted_as_is";

export interface AdoptionGate {
  total: number;
  pending: number;
  ready: boolean;
}

export function adoptionGate(rows: readonly { validationState: ValidationState }[]): AdoptionGate {
  const pending = rows.filter((row) => row.validationState === "pending").length;
  return { total: rows.length, pending, ready: pending === 0 };
}

// From stored rows ------------------------------------------------------------------
// The shape the queries hand over, kept minimal so this stays testable without
// the generated database types.

export interface AssumptionLike {
  kind: "pool_line" | "model_input";
  key: string | null;
  pool_id: string | null;
  value: number;
}

export interface LaborClassLike {
  id: string;
  key: string;
  name: string;
  pay_basis: PayBasis;
  charged_in_strategic: boolean;
  active: boolean;
}

export interface LaborRateLike {
  labor_class_id: string;
  annual_salary: number | null;
  hourly_wage: number | null;
  load_share: number;
  paid_hours: number | null;
  external_rate: number;
}

export interface PoolCatalogLike {
  id: string;
  key: string;
  name: string;
  unit_label: string;
  costing: PoolCosting;
  active: boolean;
}

export interface PoolRowLike {
  pool_id: string;
  allocation_share: number | null;
  available_units: number;
}

export interface PackageLike {
  id: string;
  name: string;
  unit_label: string;
  market_floor: number;
  active: boolean;
  labor: { labor_class_id: string; hours: number }[];
  resources: { pool_id: string; units: number }[];
}

export type ModelFromRows = { ok: true; model: RateModelInputs } | { ok: false; missing: string[] };

/**
 * Assemble the model from a version's rows and the catalogs. Reports what's
 * missing, in words, rather than throwing, so a half-built draft renders its
 * gaps instead of erroring. Every active class needs a rate row and every
 * active pool a figures row; a retired one with rows still prices.
 */
export function modelFromRows(rows: {
  assumptions: readonly AssumptionLike[];
  classes: readonly LaborClassLike[];
  laborRates: readonly LaborRateLike[];
  poolCatalog: readonly PoolCatalogLike[];
  pools: readonly PoolRowLike[];
}): ModelFromRows {
  const missing: string[] = [];
  const inputs: Partial<Record<ModelInputKey, number>> = {};
  const sharedPoolLines: number[] = [];
  const ownLines = new Map<string, number[]>();
  for (const row of rows.assumptions) {
    if (row.kind === "pool_line") {
      if (row.pool_id === null) sharedPoolLines.push(Number(row.value));
      else ownLines.set(row.pool_id, [...(ownLines.get(row.pool_id) ?? []), Number(row.value)]);
    } else if (row.key && isModelInputKey(row.key)) {
      inputs[row.key] = Number(row.value);
    }
  }
  for (const key of MODEL_INPUT_KEYS) {
    if (inputs[key] === undefined) missing.push(MODEL_INPUT_LABEL[key]);
  }

  const labor: LaborClassInput[] = [];
  for (const cls of rows.classes) {
    const rate = rows.laborRates.find((candidate) => candidate.labor_class_id === cls.id);
    if (!rate) {
      if (cls.active) missing.push(`${cls.name} pay figures`);
      continue;
    }
    labor.push({
      id: cls.id,
      key: cls.key,
      name: cls.name,
      payBasis: cls.pay_basis,
      annualSalary: rate.annual_salary === null ? null : Number(rate.annual_salary),
      hourlyWage: rate.hourly_wage === null ? null : Number(rate.hourly_wage),
      loadShare: Number(rate.load_share),
      paidHours: rate.paid_hours === null ? null : Number(rate.paid_hours),
      externalRate: Number(rate.external_rate),
      chargedInStrategic: cls.charged_in_strategic,
    });
    if (cls.pay_basis === "salaried" && (!rate.annual_salary || !rate.paid_hours)) {
      missing.push(`${cls.name} salary and paid hours`);
    }
    if (cls.pay_basis === "hourly" && rate.hourly_wage === null) {
      missing.push(`${cls.name} hourly wage`);
    }
  }

  const pools: PoolInput[] = [];
  for (const pool of rows.poolCatalog) {
    const row = rows.pools.find((candidate) => candidate.pool_id === pool.id);
    if (!row) {
      if (pool.active) missing.push(`${pool.name} pool`);
      continue;
    }
    if (pool.costing === "allocated" && row.allocation_share === null) {
      missing.push(`${pool.name} allocation`);
    }
    pools.push({
      id: pool.id,
      key: pool.key,
      name: pool.name,
      unitLabel: pool.unit_label,
      costing: pool.costing,
      allocationShare: row.allocation_share === null ? null : Number(row.allocation_share),
      availableUnits: Number(row.available_units),
      ownLines: ownLines.get(pool.id) ?? [],
    });
  }

  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    model: {
      externalMarginShare: inputs.external_margin_share!,
      assessmentShare: inputs.assessment_share!,
      sharedPoolLines,
      labor,
      pools,
    },
  };
}

export function packageSpecFromRow(row: PackageLike): PackageSpec {
  return {
    key: row.id,
    name: row.name,
    unitLabel: row.unit_label,
    labor: Object.fromEntries(row.labor.map((line) => [line.labor_class_id, Number(line.hours)])),
    resources: Object.fromEntries(row.resources.map((line) => [line.pool_id, Number(line.units)])),
    marketFloor: Number(row.market_floor),
  };
}

/** Dollars, the way the card prints them: "$1,150" or "$46.17" when cents matter. */
export function formatDollars(value: number, options: { cents?: boolean } = {}): string {
  const cents = options.cents ?? !Number.isInteger(roundCents(value));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
}

/** A share such as 0.35 as "35%"; 0.0671 as "6.71%". */
export function formatShare(value: number): string {
  const percent = roundCents(value * 100);
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2).replace(/0$/, "")}%`;
}
