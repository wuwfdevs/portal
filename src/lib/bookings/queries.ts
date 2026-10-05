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
