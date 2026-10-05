import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

export type BkVersionRow = Database["public"]["Tables"]["bk_rate_model_versions"]["Row"];
export type BkAssumptionRow = Database["public"]["Tables"]["bk_assumptions"]["Row"];
export type BkResourcePoolRow = Database["public"]["Tables"]["bk_resource_pools"]["Row"];
export type BkServicePackageRow = Database["public"]["Tables"]["bk_service_packages"]["Row"];
export type BkRateCardLineRow = Database["public"]["Tables"]["bk_rate_card_lines"]["Row"];
export type BkAssetRow = Database["public"]["Tables"]["bk_assets"]["Row"];
export type BkRateModelEventRow = Database["public"]["Tables"]["bk_rate_model_events"]["Row"];

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

export interface VersionDetail {
  version: BkVersionRow;
  assumptions: BkAssumptionRow[];
  pools: BkResourcePoolRow[];
  packages: BkServicePackageRow[];
}

export async function getVersionDetail(version: BkVersionRow): Promise<VersionDetail> {
  const supabase = await createClient();
  const [assumptions, pools, packages] = await Promise.all([
    supabase
      .from("bk_assumptions")
      .select("*")
      .eq("version_id", version.id)
      .order("section")
      .order("sort_order")
      .order("created_at"),
    supabase.from("bk_resource_pools").select("*").eq("version_id", version.id).order("pool"),
    supabase
      .from("bk_service_packages")
      .select("*")
      .eq("version_id", version.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  const poolOrder: Record<string, number> = { studio: 0, field: 1, live: 2, edit: 3 };
  return {
    version,
    assumptions: unwrapRead(assumptions, "rate model assumptions") ?? [],
    pools: (unwrapRead(pools, "resource pools") ?? []).sort(
      (a, b) => (poolOrder[a.pool] ?? 9) - (poolOrder[b.pool] ?? 9),
    ),
    packages: unwrapRead(packages, "service packages") ?? [],
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
  const result = await supabase.from("bk_assets").select("*").order("pool").order("name");
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

// Slice 2 — the term plan and the calendar ------------------------------------------------------

export type BkTermPlanRow = Database["public"]["Tables"]["bk_term_plans"]["Row"];
export type BkTermResourceRow = Database["public"]["Tables"]["bk_term_resources"]["Row"];
export type BkBlackoutRow = Database["public"]["Tables"]["bk_blackouts"]["Row"];
export type BkHoldRow = Database["public"]["Tables"]["bk_holds"]["Row"];
export type BkBookingRow = Database["public"]["Tables"]["bk_bookings"]["Row"];

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

export interface PlanCalendar {
  plan: BkTermPlanRow;
  resources: BkTermResourceRow[];
  blackouts: BkBlackoutRow[];
  holds: BkHoldRow[];
  bookings: BkBookingRow[];
}

const POOL_ORDER: Record<string, number> = { studio: 0, field: 1, live: 2, edit: 3 };

/** Everything on a plan's calendar: its resources and every blackout, hold and booking. */
export async function getPlanCalendar(plan: BkTermPlanRow): Promise<PlanCalendar> {
  const supabase = await createClient();
  const [resources, blackouts, holds, bookings] = await Promise.all([
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
  ]);
  return {
    plan,
    resources: (unwrapRead(resources, "term resources") ?? []).sort(
      (a, b) => (POOL_ORDER[a.pool] ?? 9) - (POOL_ORDER[b.pool] ?? 9),
    ),
    blackouts: unwrapRead(blackouts, "blackouts") ?? [],
    holds: unwrapRead(holds, "holds") ?? [],
    bookings: unwrapRead(bookings, "bookings") ?? [],
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
