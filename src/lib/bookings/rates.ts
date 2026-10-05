// The rate math behind Bookings' rate card — pure, no Supabase, no React.
// See docs/bookings-design.md §5. The v0.1 workbook
// (WUWF_Production_Rate_Model_v0.1.xlsx) is this module's test fixture:
// every cost and every card figure in rates.test.ts must reproduce from the
// inputs here, and SQL never computes a price (docs/bookings-design.md §7).
//
// The model, in the workbook's own order:
//   labor       — professional loaded hourly = salary × (1 + fringe) ÷ paid
//                 hours; student/OPS loaded hourly = wage × (1 + payroll load)
//   pools       — a shared production resource pool (the budget lines flagged
//                 as part of it, summed) is split across the four resource
//                 pools by allocation share; each pool's cost per unit is its
//                 allocated cost ÷ its available units
//   webcast ops — the webcasting operating pool ÷ the annual planning volume
//   packages    — strategic cost = student hours + pool units + webcast ops;
//                 incremental cost adds professional hours at the loaded rate;
//                 the external floor grosses incremental up for the target
//                 margin and the university assessment
//   card        — every rate rounds UP to the next $25; external is the higher
//                 of the grossed-up floor and the package's market floor

export const POOL_KEYS = ["studio", "field", "live", "edit"] as const;
export type PoolKey = (typeof POOL_KEYS)[number];

export const POOL_LABEL: Record<PoolKey, string> = {
  studio: "Studio / control room",
  field: "Field video package",
  live: "Live / multicamera package",
  edit: "Edit suite / post-production",
};

/** The keyed model inputs an assumption row may carry (bk_assumptions.key). */
export const MODEL_INPUT_KEYS = [
  "pro_salary",
  "pro_fringe_share",
  "paid_hours",
  "student_wage",
  "student_load_share",
  "external_margin_share",
  "assessment_share",
  "baseline_share",
  "net_capacity_days",
  "webcast_volume",
  "student_external_rate",
  "pro_external_rate",
] as const;
export type ModelInputKey = (typeof MODEL_INPUT_KEYS)[number];

export const MODEL_INPUT_LABEL: Record<ModelInputKey, string> = {
  pro_salary: "Production lead annual salary",
  pro_fringe_share: "Professional fringe / load",
  paid_hours: "Annual paid hours",
  student_wage: "Student / OPS base wage",
  student_load_share: "Student / OPS payroll load",
  external_margin_share: "External target contribution margin",
  assessment_share: "New Ventures administrative assessment",
  baseline_share: "Baseline institutional envelope",
  net_capacity_days: "Net schedulable production capacity",
  webcast_volume: "Annual webcast planning volume",
  student_external_rate: "Student / OPS labor, external planning rate",
  pro_external_rate: "Professional labor, external planning rate",
};

export function isModelInputKey(value: string): value is ModelInputKey {
  return (MODEL_INPUT_KEYS as readonly string[]).includes(value);
}

export interface PoolInput {
  allocationShare: number;
  availableUnits: number;
  unitLabel: string;
}

export interface RateModelInputs {
  inputs: Record<ModelInputKey, number>;
  /** Annual dollars of each budget line in the shared production resource pool. */
  sharedPoolLines: number[];
  /** Annual dollars of each budget line in the webcasting operating pool. */
  webcastPoolLines: number[];
  pools: Record<PoolKey, PoolInput>;
}

export interface PoolDerived extends PoolInput {
  annualCost: number;
  costPerUnit: number;
}

export interface DerivedMetrics {
  proLoadedHourly: number;
  studentLoadedHourly: number;
  sharedPoolAnnual: number;
  webcastPoolAnnual: number;
  webcastOpsPerEvent: number;
  baselineCapacityDays: number;
  pools: Record<PoolKey, PoolDerived>;
}

export interface PackageSpec {
  key: string;
  name: string;
  unitLabel: string;
  professionalHours: number;
  studentHours: number;
  units: Record<PoolKey, number>;
  webcastOpsUnits: number;
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

export function computeDerived(model: RateModelInputs): DerivedMetrics {
  const { inputs } = model;
  if (inputs.paid_hours <= 0) throw new Error("Annual paid hours must be positive");
  if (inputs.webcast_volume <= 0) throw new Error("Webcast planning volume must be positive");

  const sharedPoolAnnual = sum(model.sharedPoolLines);
  const webcastPoolAnnual = sum(model.webcastPoolLines);

  const pools = Object.fromEntries(
    POOL_KEYS.map((key) => {
      const pool = model.pools[key];
      if (pool.availableUnits <= 0) {
        throw new Error(`${POOL_LABEL[key]} must have available units`);
      }
      const annualCost = sharedPoolAnnual * pool.allocationShare;
      return [key, { ...pool, annualCost, costPerUnit: annualCost / pool.availableUnits }];
    }),
  ) as Record<PoolKey, PoolDerived>;

  return {
    proLoadedHourly: (inputs.pro_salary * (1 + inputs.pro_fringe_share)) / inputs.paid_hours,
    studentLoadedHourly: inputs.student_wage * (1 + inputs.student_load_share),
    sharedPoolAnnual,
    webcastPoolAnnual,
    webcastOpsPerEvent: webcastPoolAnnual / inputs.webcast_volume,
    baselineCapacityDays: inputs.baseline_share * inputs.net_capacity_days,
    pools,
  };
}

/** The share of an external price left after the target margin and the assessment. */
export function externalNetShare(
  inputs: Pick<RateModelInputs["inputs"], "external_margin_share" | "assessment_share">,
): number {
  const share = 1 - inputs.external_margin_share - inputs.assessment_share;
  if (share <= 0) throw new Error("Margin and assessment leave nothing of an external price");
  return share;
}

export function pricePackage(
  spec: PackageSpec,
  derived: DerivedMetrics,
  inputs: RateModelInputs["inputs"],
): PackageCosts {
  const resourceCost = sum(
    POOL_KEYS.map((key) => spec.units[key] * derived.pools[key].costPerUnit),
  );
  const strategicCost =
    spec.studentHours * derived.studentLoadedHourly +
    resourceCost +
    spec.webcastOpsUnits * derived.webcastOpsPerEvent;
  const incrementalCost = strategicCost + spec.professionalHours * derived.proLoadedHourly;
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
  key: "student_labor" | "professional_labor";
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
    packages: packages.map((spec) => ({ ...spec, ...pricePackage(spec, derived, model.inputs) })),
    labor: [
      {
        key: "student_labor",
        name: "Student / OPS labor",
        unitLabel: "hour",
        internalRate: roundCents(derived.studentLoadedHourly),
        externalRate: model.inputs.student_external_rate,
        treatment: "Recover when incremental",
      },
      {
        key: "professional_labor",
        name: "Professional labor beyond the envelope",
        unitLabel: "hour",
        internalRate: roundCents(derived.proLoadedHourly),
        externalRate: model.inputs.pro_external_rate,
        treatment: "Recover outside the baseline institutional envelope",
      },
    ],
  };
}

// Sensitivity ---------------------------------------------------------------------
// "What moves the price most": re-run the model with one input moved and
// report the change in each package's incremental cost, so validation effort
// goes where it changes the card. Advisory; nothing stores it.

export interface SensitivityMove {
  key: ModelInputKey;
  label: string;
  /** Applied to the input: an absolute delta. */
  delta: number;
  /** How the move reads on screen, e.g. "+10 pts". */
  moveLabel: string;
}

export const DEFAULT_SENSITIVITY_MOVES: SensitivityMove[] = [
  {
    key: "pro_fringe_share",
    label: MODEL_INPUT_LABEL.pro_fringe_share,
    delta: 0.1,
    moveLabel: "+10 pts",
  },
  { key: "student_wage", label: MODEL_INPUT_LABEL.student_wage, delta: 1, moveLabel: "+$1 / hr" },
  {
    key: "webcast_volume",
    label: MODEL_INPUT_LABEL.webcast_volume,
    delta: -5,
    moveLabel: "−5 events",
  },
  { key: "pro_salary", label: MODEL_INPUT_LABEL.pro_salary, delta: 5000, moveLabel: "+$5,000" },
];

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
  moves: readonly SensitivityMove[] = DEFAULT_SENSITIVITY_MOVES,
): SensitivityRow[] {
  const base = buildRateCard(model, packages);
  const rows = moves.flatMap((move) => {
    const moved: RateModelInputs = {
      ...model,
      inputs: { ...model.inputs, [move.key]: model.inputs[move.key] + move.delta },
    };
    let card: RateCard;
    try {
      card = buildRateCard(moved, packages);
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
  key: string | null;
  kind: "shared_pool_line" | "webcast_pool_line" | "model_input";
  value: number;
}

export interface PoolLike {
  pool: PoolKey;
  allocation_share: number;
  available_units: number;
  unit_label: string;
}

export interface PackageLike {
  id: string;
  name: string;
  unit_label: string;
  professional_hours: number;
  student_hours: number;
  studio_units: number;
  field_units: number;
  live_units: number;
  edit_hours: number;
  webcast_ops_units: number;
  market_floor: number;
  active: boolean;
}

export type ModelFromRows =
  | { ok: true; model: RateModelInputs }
  | { ok: false; missing: ModelInputKey[]; missingPools: PoolKey[] };

/**
 * Assemble the model from a version's rows. Reports what's missing rather
 * than throwing, so a half-built draft renders its gaps instead of erroring.
 */
export function modelFromRows(
  assumptions: readonly AssumptionLike[],
  pools: readonly PoolLike[],
): ModelFromRows {
  const inputs: Partial<Record<ModelInputKey, number>> = {};
  const sharedPoolLines: number[] = [];
  const webcastPoolLines: number[] = [];
  for (const row of assumptions) {
    if (row.kind === "shared_pool_line") sharedPoolLines.push(row.value);
    else if (row.kind === "webcast_pool_line") webcastPoolLines.push(row.value);
    else if (row.key && isModelInputKey(row.key)) inputs[row.key] = row.value;
  }
  const missing = MODEL_INPUT_KEYS.filter((key) => inputs[key] === undefined);

  const poolInputs: Partial<Record<PoolKey, PoolInput>> = {};
  for (const row of pools) {
    poolInputs[row.pool] = {
      allocationShare: row.allocation_share,
      availableUnits: row.available_units,
      unitLabel: row.unit_label,
    };
  }
  const missingPools = POOL_KEYS.filter((key) => poolInputs[key] === undefined);

  if (missing.length > 0 || missingPools.length > 0) {
    return { ok: false, missing, missingPools };
  }
  return {
    ok: true,
    model: {
      inputs: inputs as Record<ModelInputKey, number>,
      sharedPoolLines,
      webcastPoolLines,
      pools: poolInputs as Record<PoolKey, PoolInput>,
    },
  };
}

export function packageSpecFromRow(row: PackageLike): PackageSpec {
  return {
    key: row.id,
    name: row.name,
    unitLabel: row.unit_label,
    professionalHours: row.professional_hours,
    studentHours: row.student_hours,
    units: {
      studio: row.studio_units,
      field: row.field_units,
      live: row.live_units,
      edit: row.edit_hours,
    },
    webcastOpsUnits: row.webcast_ops_units,
    marketFloor: row.market_floor,
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
