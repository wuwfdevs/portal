import "server-only";
import { createClient } from "@/lib/supabase/server";
import { agreementReserveCovers } from "./agreements";
import { computeEconomics, economicsColumns } from "./economics";
import { parseAirtimeRead } from "./airtime";
import {
  derivePricing,
  estimateDraw,
  isAdjusted,
  priceAdjustedLine,
  priceLine,
  reserveCoversDraw,
  type DerivedPricing,
} from "./pricing";
import {
  agreementConsumptionFor,
  getCurrentPlan,
  getPlanForDate,
  getPlanCalendar,
  getPricingContext,
  type BkAgreementRow,
  type BkEstimateLineRow,
  type BkPartnerRow,
  type BkProjectRow,
  type PlanCalendar,
  type PricingContext,
} from "./queries";
import { capacitySummary, parseWindows, toHHMM, type CalendarState } from "./scheduling";

/**
 * The estimate's server-side glue (slice 3): derive the treatment from the
 * facts on a project (docs/bookings-design.md §2.2), then write every
 * line's rate from the card snapshot. The pure arithmetic is in pricing.ts;
 * this module only reads the rows and writes the result. Called after any
 * write that can change the treatment or a line.
 */

/** The database rows as the pure scheduling module's shape — shared with the calendar page. */
export function calendarStateFrom(calendar: PlanCalendar, nowISO: string): CalendarState {
  return {
    plan: calendar.plan,
    capacity: calendar.capacity.map((row) => ({
      labor_class_id: row.labor_class_id,
      net_hours: Number(row.net_hours),
      reserve_share: row.reserve_share === null ? null : Number(row.reserve_share),
      headcount: Number(row.headcount),
      hours_per_person_day: Number(row.hours_per_person_day),
    })),
    classes: calendar.classes.map((cls) => ({ id: cls.id, name: cls.name })),
    pools: calendar.pools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      unit_label: pool.unit_label,
    })),
    resources: calendar.resources.map((r) => ({
      pool_id: r.pool_id,
      available_units: Number(r.available_units),
      concurrent_units: Number(r.concurrent_units),
      windows: parseWindows(r.windows),
    })),
    blackouts: calendar.blackouts,
    holds: calendar.holds.map((h) => ({
      ...h,
      window_start: toHHMM(h.window_start),
      window_end: toHHMM(h.window_end),
    })),
    bookings: calendar.bookings.map((b) => ({
      ...b,
      window_start: toHHMM(b.window_start),
      window_end: toHHMM(b.window_end),
    })),
    reservedBlocks: calendar.reservedBlocks.map((rb) => ({
      ...rb,
      window_start: toHHMM(rb.window_start),
      window_end: toHHMM(rb.window_end),
    })),
    nowISO,
  };
}

/**
 * Whether the active term's reserve covers this estimate's professional
 * draw. Null when there is no active term, no tracked class, or no draw —
 * the derivation then prices qualifying work strategic (§2.2 checks the
 * reserve only where there is one to check).
 */
export async function reserveCoversEstimate(
  project: Pick<BkProjectRow, "id" | "event_starts_on">,
  lines: readonly BkEstimateLineRow[],
  context: PricingContext,
): Promise<boolean | null> {
  // The reserve that matters is the one of the term the work happens in (§22.3);
  // without an event date, the current term's.
  const plan = project.event_starts_on
    ? await getPlanForDate(project.event_starts_on)
    : await getCurrentPlan();
  if (!plan) return null;
  const calendar = await getPlanCalendar(plan);
  // This project's own live holds already draw the reserve; don't count them twice.
  const state = calendarStateFrom(
    { ...calendar, bookings: calendar.bookings.filter((b) => b.project_id !== project.id) },
    new Date().toISOString(),
  );
  const draw = estimateDraw(
    lines.map((line) => ({ ...line, labor_hours: line.labor_hours ?? {} })),
  );
  return reserveCoversDraw(draw, context.classes, capacitySummary(state));
}

/**
 * §2.2's agreement row (slice 5): a project under an active agreement is
 * priced against the agreement's allocated reserve share — what it has left
 * after its other projects' live strategic holds — and incremental beyond it.
 * The term's own reserve is still checked when the holds are placed.
 */
export async function derivedPricingFor(
  project: BkProjectRow,
  partner: Pick<BkPartnerRow, "kind">,
  lines: readonly BkEstimateLineRow[],
  context: PricingContext,
  agreement: BkAgreementRow | null,
): Promise<DerivedPricing> {
  const underAgreement = agreement !== null && agreement.status === "active";
  let reserveCovers: boolean | null;
  if (underAgreement) {
    const consumption = await agreementConsumptionFor(agreement, undefined, project.id);
    const draw = estimateDraw(
      lines.map((line) => ({ ...line, labor_hours: line.labor_hours ?? {} })),
    );
    reserveCovers = agreementReserveCovers(draw, context.classes, consumption);
  } else {
    reserveCovers = await reserveCoversEstimate(project, lines, context);
  }
  return derivePricing({
    partnerKind: partner.kind,
    underAgreement,
    qualifiesStrategic: project.qualifies_strategic,
    reserveCovers,
  });
}

export type RepriceResult = { ok: true; context: PricingContext } | { ok: false; error: string };

/**
 * Re-derive the project's treatment (unless the lead overrode it) and write
 * every line's rate under it. The version is the one the project was first
 * priced on, else the one in use — recorded on the project the first time
 * so a later version never reprices an estimate that has gone out.
 */
export async function repriceProject(projectId: string): Promise<RepriceResult> {
  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("bk_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project)
    return { ok: false, error: error?.message ?? "That request no longer exists." };
  const [
    { data: partner, error: partnerError },
    { data: lineRows, error: linesError },
    { data: agreement, error: agreementError },
  ] = await Promise.all([
    supabase.from("bk_partners").select("kind").eq("id", project.partner_id).maybeSingle(),
    supabase.from("bk_estimate_lines").select("*").eq("project_id", projectId),
    project.agreement_id
      ? supabase.from("bk_agreements").select("*").eq("id", project.agreement_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const readError = partnerError ?? linesError ?? agreementError;
  if (readError) return { ok: false, error: readError.message };
  const context = await getPricingContext(project.rate_model_version_id);
  if (!context) {
    return {
      ok: false,
      error:
        "No rate card is recorded for estimates. Finance records one on the Rates tab (Rate card → Record for estimates).",
    };
  }
  const lines = lineRows ?? [];

  let treatment = project.priced_as;
  let reason = project.pricing_reason;
  let reserveDepleted = project.reserve_depleted;
  if (!project.pricing_overridden_by || !treatment) {
    const derived = await derivedPricingFor(
      project,
      partner ?? { kind: "uwf_unit" },
      lines,
      context,
      agreement ?? null,
    );
    treatment = derived.treatment;
    reason = derived.reason;
    reserveDepleted = derived.reserveDepleted;
  }

  const { error: projectError } = await supabase
    .from("bk_projects")
    .update({
      priced_as: treatment,
      pricing_reason: reason,
      reserve_depleted: reserveDepleted,
      rate_model_version_id: project.rate_model_version_id ?? context.version.id,
    })
    .eq("id", projectId);
  if (projectError) return { ok: false, error: projectError.message };

  const pricedLines: typeof lines = [];
  for (const line of lines) {
    const recipe = {
      ...line,
      labor_hours: line.labor_hours ?? {},
      resource_units: line.resource_units ?? {},
    };
    let priced: ReturnType<typeof priceLine>;
    if (isAdjusted(recipe)) {
      // An adjusted scope is priced from the version's unit costs by the same recipe math (§20.6).
      const cardLine = context.card.find(
        (c) => c.kind === "package" && c.package_id === line.package_id,
      );
      if (!cardLine || context.unitCosts.length === 0) {
        return {
          ok: false,
          error: `${line.label}: the rate card in use has no unit costs recorded to price an adjusted scope; Finance records it again on the Rates tab.`,
        };
      }
      const adjusted = priceAdjustedLine(
        recipe,
        treatment ?? "incremental",
        cardLine,
        context.unitCosts,
        {
          externalMarginShare: context.externalMarginShare,
          assessmentShare: context.assessmentShare,
        },
        line.label,
      );
      priced = {
        ok: true,
        price: { unit_rate: adjusted.unit_rate, amount: adjusted.amount },
      };
    } else {
      priced = priceLine(
        line,
        treatment ?? "incremental",
        context.card,
        context.classes,
        context.assessmentShare,
      );
    }
    if (!priced.ok) return { ok: false, error: `${line.label}: ${priced.error}` };
    pricedLines.push({ ...line, ...priced.price });
    if (
      Number(line.unit_rate) === priced.price.unit_rate &&
      Number(line.amount) === priced.price.amount
    ) {
      continue;
    }
    const { error: lineError } = await supabase
      .from("bk_estimate_lines")
      .update(priced.price)
      .eq("id", line.id);
    if (lineError) return { ok: false, error: lineError.message };
  }

  // What the work costs and what WUWF contributes, stored with the price (§19.1). A card recorded
  // before costs were kept can't model them; the estimate still prices, and the panel says why.
  const economics = computeEconomics(
    pricedLines.map((line) => ({ ...line, labor_hours: line.labor_hours ?? {} })),
    context.card,
    treatment ?? "incremental",
    context.assessmentShare,
    { unitCosts: context.unitCosts, externalMarginShare: context.externalMarginShare },
  );
  const { error: economicsError } = await supabase
    .from("bk_projects")
    .update(
      economics.ok
        ? economicsColumns(economics.economics)
        : {
            labor_cost: null,
            resource_cost: null,
            direct_expense_cost: null,
            full_economic_cost: null,
            partner_recovery: null,
            wuwf_contribution: null,
            external_margin: null,
            external_assessment: null,
            market_benchmarks: [],
            economics: { version: 1, lines: [], error: economics.error },
          },
    )
    .eq("id", projectId);
  if (economicsError) return { ok: false, error: economicsError.message };

  // A planned date is priced as the project is; a sent hold takes the treatment when re-sent.
  const { error: datesError } = await supabase
    .from("bk_bookings")
    .update({ treatment })
    .eq("project_id", projectId)
    .eq("status", "planned")
    .neq("treatment", treatment);
  if (datesError) return { ok: false, error: datesError.message };

  return { ok: true, context };
}

export { parseAirtimeRead };
