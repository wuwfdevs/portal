import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";
import { hoursByClass, type HoursByClass } from "./scheduling";

type Tables = Database["public"]["Tables"];
export type BkLaborClassRow = Tables["bk_labor_classes"]["Row"];
export type BkPoolRow = Tables["bk_pools"]["Row"];
export type BkVersionRow = Tables["bk_rate_model_versions"]["Row"];
export type BkAssumptionRow = Tables["bk_assumptions"]["Row"];
export type BkLaborRateRow = Tables["bk_labor_rates"]["Row"];
export type BkResourcePoolRow = Tables["bk_resource_pools"]["Row"];
export type BkServicePackageRow = Tables["bk_service_packages"]["Row"];
export type BkRateCardLineRow = Tables["bk_rate_card_lines"]["Row"];
export type BkAssetRow = Tables["bk_assets"]["Row"];
export type BkRateModelEventRow = Tables["bk_rate_model_events"]["Row"];
export type BkTermPlanRow = Tables["bk_term_plans"]["Row"];
export type BkTermCapacityRow = Tables["bk_term_capacity"]["Row"];
export type BkTermResourceRow = Tables["bk_term_resources"]["Row"];
export type BkBlackoutRow = Tables["bk_blackouts"]["Row"];
export type BkHoldRow = Tables["bk_holds"]["Row"];
export type BkBookingRow = Tables["bk_bookings"]["Row"];

// Catalogs ------------------------------------------------------------------------------------------------

/** Every labor class, retired ones included, in sort order. */
export async function listLaborClasses(): Promise<BkLaborClassRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_labor_classes")
    .select("*")
    .order("sort_order")
    .order("name");
  return unwrapRead(result, "labor classes") ?? [];
}

/** Every pool, retired ones included, in sort order. */
export async function listPools(): Promise<BkPoolRow[]> {
  const supabase = await createClient();
  const result = await supabase.from("bk_pools").select("*").order("sort_order").order("name");
  return unwrapRead(result, "resource pools") ?? [];
}

// Rate model ------------------------------------------------------------------------------------------------

/** Every version, newest first. */
export async function listVersions(): Promise<BkVersionRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_rate_model_versions")
    .select("*")
    .order("created_at", { ascending: false });
  return unwrapRead(result, "rate model versions") ?? [];
}

/**
 * The version a Rates screen shows: the one asked for, else the one in use,
 * else the newest. Null only when no version exists at all.
 */
export function pickVersion(
  versions: BkVersionRow[],
  requestedId: string | undefined,
): BkVersionRow | null {
  if (requestedId) {
    const requested = versions.find((version) => version.id === requestedId);
    if (requested) return requested;
  }
  return versions.find((version) => version.in_use) ?? versions[0] ?? null;
}

export interface PackageWithParts extends BkServicePackageRow {
  labor: { labor_class_id: string; hours: number }[];
  resources: { pool_id: string; units: number }[];
}

export interface VersionDetail {
  version: BkVersionRow;
  assumptions: BkAssumptionRow[];
  laborRates: BkLaborRateRow[];
  pools: BkResourcePoolRow[];
  packages: PackageWithParts[];
  classes: BkLaborClassRow[];
  poolCatalog: BkPoolRow[];
}

export async function getVersionDetail(version: BkVersionRow): Promise<VersionDetail> {
  const supabase = await createClient();
  const [assumptions, laborRates, pools, packages, classes, poolCatalog] = await Promise.all([
    supabase
      .from("bk_assumptions")
      .select("*")
      .eq("version_id", version.id)
      .order("section")
      .order("sort_order")
      .order("created_at"),
    supabase.from("bk_labor_rates").select("*").eq("version_id", version.id),
    supabase.from("bk_resource_pools").select("*").eq("version_id", version.id),
    supabase
      .from("bk_service_packages")
      .select("*")
      .eq("version_id", version.id)
      .order("sort_order")
      .order("created_at"),
    listLaborClasses(),
    listPools(),
  ]);
  const packageRows = unwrapRead(packages, "service packages") ?? [];
  const packageIds = packageRows.map((pkg) => pkg.id);
  const [labor, resources] = await Promise.all([
    packageIds.length > 0
      ? supabase.from("bk_package_labor").select("*").in("package_id", packageIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length > 0
      ? supabase.from("bk_package_resources").select("*").in("package_id", packageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const laborRows = unwrapRead(labor, "package labor") ?? [];
  const resourceRows = unwrapRead(resources, "package resources") ?? [];
  return {
    version,
    assumptions: unwrapRead(assumptions, "rate model assumptions") ?? [],
    laborRates: unwrapRead(laborRates, "labor rates") ?? [],
    pools: unwrapRead(pools, "resource pool figures") ?? [],
    packages: packageRows.map((pkg) => ({
      ...pkg,
      labor: laborRows
        .filter((row) => row.package_id === pkg.id)
        .map((row) => ({ labor_class_id: row.labor_class_id, hours: Number(row.hours) })),
      resources: resourceRows
        .filter((row) => row.package_id === pkg.id)
        .map((row) => ({ pool_id: row.pool_id, units: Number(row.units) })),
    })),
    classes,
    poolCatalog,
  };
}

export async function listRateCardLines(versionId: string): Promise<BkRateCardLineRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_rate_card_lines")
    .select("*")
    .eq("version_id", versionId)
    .order("sort_order");
  return unwrapRead(result, "rate card snapshot") ?? [];
}

export async function listAssets(): Promise<BkAssetRow[]> {
  const supabase = await createClient();
  const result = await supabase.from("bk_assets").select("*").order("name");
  return unwrapRead(result, "assets") ?? [];
}

export async function getAsset(id: string): Promise<BkAssetRow | null> {
  const supabase = await createClient();
  const result = await supabase.from("bk_assets").select("*").eq("id", id).maybeSingle();
  return unwrapRead(result, "asset");
}

export interface RateModelEvent extends BkRateModelEventRow {
  actor_name: string | null;
  version_label: string | null;
}

export async function listRateModelEvents(limit = 100): Promise<RateModelEvent[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_rate_model_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  const events = unwrapRead(result, "rate model change log") ?? [];
  if (events.length === 0) return [];

  const actorIds = [...new Set(events.map((event) => event.actor_id).filter(Boolean))] as string[];
  const versionIds = [
    ...new Set(events.map((event) => event.version_id).filter(Boolean)),
  ] as string[];
  const [profiles, versions] = await Promise.all([
    actorIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", actorIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length > 0
      ? supabase.from("bk_rate_model_versions").select("id, label").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const names = new Map(
    (unwrapRead(profiles, "change log actors") ?? []).map((row) => [row.id, row.display_name]),
  );
  const labels = new Map(
    (unwrapRead(versions, "change log versions") ?? []).map((row) => [row.id, row.label]),
  );
  return events.map((event) => ({
    ...event,
    actor_name: event.actor_id ? (names.get(event.actor_id) ?? null) : null,
    version_label: event.version_id ? (labels.get(event.version_id) ?? null) : null,
  }));
}

// The term plan and the calendar --------------------------------------------------------------------

/** Every term plan, latest term first. */
export async function listPlans(): Promise<BkTermPlanRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_term_plans")
    .select("*")
    .order("starts_on", { ascending: false });
  return unwrapRead(result, "term plans") ?? [];
}

/**
 * The plan a Calendar screen shows: the one asked for, else the active one,
 * else the latest. Null only when no plan exists at all.
 */
export function pickPlan(
  plans: BkTermPlanRow[],
  requestedId: string | undefined,
): BkTermPlanRow | null {
  if (requestedId) {
    const requested = plans.find((plan) => plan.id === requestedId);
    if (requested) return requested;
  }
  return plans.find((plan) => plan.status === "active") ?? plans[0] ?? null;
}

export interface HoldWithHours extends BkHoldRow {
  hours: HoursByClass;
}

export interface BookingWithHours extends BkBookingRow {
  hours: HoursByClass;
}

export interface PlanCalendar {
  plan: BkTermPlanRow;
  capacity: BkTermCapacityRow[];
  resources: BkTermResourceRow[];
  blackouts: BkBlackoutRow[];
  holds: HoldWithHours[];
  bookings: BookingWithHours[];
  classes: BkLaborClassRow[];
  pools: BkPoolRow[];
}

/** Everything on a plan's calendar: its capacity, resources, and every blackout, hold and booking with their hours. */
export async function getPlanCalendar(plan: BkTermPlanRow): Promise<PlanCalendar> {
  const supabase = await createClient();
  const [capacity, resources, blackouts, holds, bookings, classes, pools] = await Promise.all([
    supabase.from("bk_term_capacity").select("*").eq("plan_id", plan.id),
    supabase.from("bk_term_resources").select("*").eq("plan_id", plan.id),
    supabase.from("bk_blackouts").select("*").eq("plan_id", plan.id).order("starts_on"),
    supabase
      .from("bk_holds")
      .select("*")
      .eq("plan_id", plan.id)
      .order("date")
      .order("window_start"),
    supabase
      .from("bk_bookings")
      .select("*")
      .eq("plan_id", plan.id)
      .order("date")
      .order("window_start"),
    listLaborClasses(),
    listPools(),
  ]);
  const holdRows = unwrapRead(holds, "holds") ?? [];
  const bookingRows = unwrapRead(bookings, "bookings") ?? [];
  const [holdLabor, bookingLabor] = await Promise.all([
    holdRows.length > 0
      ? supabase
          .from("bk_hold_labor")
          .select("*")
          .in(
            "hold_id",
            holdRows.map((h) => h.id),
          )
      : Promise.resolve({ data: [], error: null }),
    bookingRows.length > 0
      ? supabase
          .from("bk_booking_labor")
          .select("*")
          .in(
            "booking_id",
            bookingRows.map((b) => b.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  const holdLaborRows = unwrapRead(holdLabor, "hold labor") ?? [];
  const bookingLaborRows = unwrapRead(bookingLabor, "booking labor") ?? [];
  const poolOrder = new Map(pools.map((pool, index) => [pool.id, index]));
  return {
    plan,
    capacity: unwrapRead(capacity, "term capacity") ?? [],
    resources: (unwrapRead(resources, "term resources") ?? []).sort(
      (a, b) => (poolOrder.get(a.pool_id) ?? 99) - (poolOrder.get(b.pool_id) ?? 99),
    ),
    blackouts: unwrapRead(blackouts, "blackouts") ?? [],
    holds: holdRows.map((hold) => ({
      ...hold,
      hours: hoursByClass(holdLaborRows.filter((row) => row.hold_id === hold.id)),
    })),
    bookings: bookingRows.map((booking) => ({
      ...booking,
      hours: hoursByClass(bookingLaborRows.filter((row) => row.booking_id === booking.id)),
    })),
    classes,
    pools,
  };
}

/**
 * The airtime boundary read (docs/bookings-design.md §6.5). A failed read is
 * reported, not hidden: the Calendar shows the envelope as unavailable with
 * the reason rather than as zero inventory.
 */
export async function readUniversityAvails(
  planId: string,
): Promise<{ payload: unknown; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_university_avails_per_week", {
    p_plan_id: planId,
  });
  if (error) return { payload: null, error: error.message };
  if (data && "error" in data) return { payload: null, error: String(data.error) };
  return { payload: data, error: null };
}
