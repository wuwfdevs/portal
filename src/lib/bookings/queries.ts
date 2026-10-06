import type { LineEconomics } from "./economics";
import type { BookingEventLike, ObservedProject } from "./observed";
import { isAdjusted } from "./pricing";
import { inTerm, type ReportProject } from "./report";
import type { SettledProject } from "./settlements";
import type { ProjectDateFacts } from "./badges";
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";
import { pageRange } from "@/lib/pagination";
import { stationTodayISO } from "@/lib/log/timezone";
import {
  agreementConsumption,
  reservedBlockState,
  type AgreementConsumption,
  type ReservedBlockState,
} from "./agreements";
import {
  bookingIsLive,
  hoursByClass,
  type CalendarReservedBlock,
  type HoursByClass,
} from "./scheduling";

type Tables = Database["public"]["Tables"];
export type BkLaborClassRow = Tables["bk_labor_classes"]["Row"];
export type BkHoursUsedRow = Tables["bk_hours_used"]["Row"];
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
  /** Agreements' reserved blocks inside the term, with the agreement facts the rule reads (slice 5). */
  reservedBlocks: CalendarReservedBlock[];
  classes: BkLaborClassRow[];
  pools: BkPoolRow[];
}

/** Everything on a plan's calendar: its capacity, resources, and every blackout, hold, booking and reserved block. */
export async function getPlanCalendar(plan: BkTermPlanRow): Promise<PlanCalendar> {
  const supabase = await createClient();
  const [capacity, resources, blackouts, holds, bookings, classes, pools, reservedBlocks] =
    await Promise.all([
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
      listReservedBlocksBetween(plan.starts_on, plan.ends_on),
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
    reservedBlocks,
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

// Partners, projects and what hangs off a project (slice 3) ----------------------------------------

export type BkPartnerRow = Tables["bk_partners"]["Row"];
export type BkProjectRow = Tables["bk_projects"]["Row"];
export type BkEstimateLineRow = Tables["bk_estimate_lines"]["Row"];
export type BkAirtimeCommitmentRow = Tables["bk_airtime_commitments"]["Row"];
export type BkProjectEventRow = Tables["bk_project_events"]["Row"];
export type BkSettingsRow = Tables["bk_settings"]["Row"];
export type BkSettlementRow = Tables["bk_settlements"]["Row"];

/** Every partner, by name. */
export async function listPartners(): Promise<BkPartnerRow[]> {
  const supabase = await createClient();
  const result = await supabase.from("bk_partners").select("*").order("name");
  return unwrapRead(result, "partners") ?? [];
}

export interface ProjectListItem extends BkProjectRow {
  partner_name: string;
  partner_kind: BkPartnerRow["kind"];
}

async function partnersById(ids: string[]): Promise<Map<string, BkPartnerRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const result = await supabase.from("bk_partners").select("*").in("id", unique);
  return new Map((unwrapRead(result, "partners") ?? []).map((row) => [row.id, row]));
}

function withPartners(
  rows: BkProjectRow[],
  partners: Map<string, BkPartnerRow>,
): ProjectListItem[] {
  return rows.map((row) => ({
    ...row,
    partner_name: partners.get(row.partner_id)?.name ?? "Partner",
    partner_kind: partners.get(row.partner_id)?.kind ?? "uwf_unit",
  }));
}

/** The Requests list's view: a stage, every open project, or the closed ones. */
export type ProjectListView = "open" | "closed" | BkProjectRow["stage"];

/** The filter a view applies, as PostgREST filter triples. */
function viewFilters(view: ProjectListView): [string, string, string][] {
  if (view === "open")
    return [
      ["disposition", "is", "null"],
      ["stage", "neq", "settled"],
    ];
  if (view === "closed") return [["disposition", "not.is", "null"]];
  return [
    ["stage", "eq", view],
    ["disposition", "is", "null"],
  ];
}

/**
 * One page of projects, filtered and searched in the query
 * (docs/ui-patterns.md, "Pagination"), newest first.
 */
export async function listProjectsPage(options: {
  view: ProjectListView;
  q: string | null;
  page: number;
}): Promise<{ rows: ProjectListItem[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(options.page);
  let query = supabase.from("bk_projects").select("*", { count: "exact" });
  for (const [column, operator, value] of viewFilters(options.view)) {
    query = query.filter(column, operator, value);
  }
  if (options.q) query = query.ilike("title", `%${options.q.replace(/[%_]/g, "")}%`);
  const result = await query.order("created_at", { ascending: false }).order("id").range(from, to);
  if (result.error?.code === "PGRST103") {
    return { rows: [], total: await countProjects(options.view, options.q) };
  }
  const rows = unwrapRead(result, "requests") ?? [];
  return {
    rows: withPartners(rows, await partnersById(rows.map((row) => row.partner_id))),
    total: result.count ?? 0,
  };
}

export async function countProjects(view: ProjectListView, q: string | null): Promise<number> {
  const supabase = await createClient();
  let query = supabase.from("bk_projects").select("id", { count: "exact", head: true });
  for (const [column, operator, value] of viewFilters(view)) {
    query = query.filter(column, operator, value);
  }
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  const result = await query;
  unwrapRead(result, "request count");
  return result.count ?? 0;
}

/** Every open project (no disposition, not settled), for the dashboard's action list and tiles. */
export async function listOpenProjects(): Promise<ProjectListItem[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_projects")
    .select("*")
    .is("disposition", null)
    .neq("stage", "settled")
    .order("created_at", { ascending: false });
  const rows = unwrapRead(result, "open requests") ?? [];
  return withPartners(rows, await partnersById(rows.map((row) => row.partner_id)));
}

export interface ProjectEvent extends BkProjectEventRow {
  actor_name: string | null;
}

export interface ProjectDetail {
  project: BkProjectRow;
  partner: BkPartnerRow;
  /** The agreement the project is under (slice 5), or null. */
  agreement: BkAgreementRow | null;
  lines: BkEstimateLineRow[];
  bookings: BookingWithHours[];
  commitments: BkAirtimeCommitmentRow[];
  events: ProjectEvent[];
  version_label: string | null;
  owner_name: string | null;
}

export async function getProjectDetail(id: string): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const projectResult = await supabase.from("bk_projects").select("*").eq("id", id).maybeSingle();
  const project = unwrapRead(projectResult, "request");
  if (!project) return null;
  const [partner, lines, bookings, commitments, events, version, agreement] = await Promise.all([
    supabase.from("bk_partners").select("*").eq("id", project.partner_id).maybeSingle(),
    supabase
      .from("bk_estimate_lines")
      .select("*")
      .eq("project_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("bk_bookings")
      .select("*")
      .eq("project_id", id)
      .order("date")
      .order("window_start"),
    supabase.from("bk_airtime_commitments").select("*").eq("project_id", id).order("starts_on"),
    supabase.from("bk_project_events").select("*").eq("project_id", id).order("created_at"),
    project.rate_model_version_id
      ? supabase
          .from("bk_rate_model_versions")
          .select("label")
          .eq("id", project.rate_model_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    project.agreement_id
      ? supabase.from("bk_agreements").select("*").eq("id", project.agreement_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const partnerRow = unwrapRead(partner, "partner");
  if (!partnerRow) return null;
  const bookingRows = unwrapRead(bookings, "the project's dates") ?? [];
  const eventRows = unwrapRead(events, "the project's activity") ?? [];
  const [labor, names] = await Promise.all([
    bookingRows.length > 0
      ? supabase
          .from("bk_booking_labor")
          .select("*")
          .in(
            "booking_id",
            bookingRows.map((b) => b.id),
          )
      : Promise.resolve({ data: [], error: null }),
    displayNames([...eventRows.map((e) => e.actor_id), project.owner_id]),
  ]);
  const laborRows = unwrapRead(labor, "the dates' hours") ?? [];
  return {
    project,
    partner: partnerRow,
    agreement: unwrapRead(agreement, "agreement"),
    lines: unwrapRead(lines, "estimate lines") ?? [],
    bookings: bookingRows.map((booking) => ({
      ...booking,
      hours: hoursByClass(laborRows.filter((row) => row.booking_id === booking.id)),
    })),
    commitments: unwrapRead(commitments, "airtime commitments") ?? [],
    events: eventRows.map((event) => ({
      ...event,
      actor_name: event.actor_id ? (names.get(event.actor_id) ?? null) : null,
    })),
    version_label: unwrapRead(version, "rate model version")?.label ?? null,
    owner_name: project.owner_id ? (names.get(project.owner_id) ?? null) : null,
  };
}

async function displayNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id, display_name").in("id", unique);
  return new Map((unwrapRead(result, "names") ?? []).map((row) => [row.id, row.display_name]));
}

/** Every airtime commitment with its project's title, for the envelope check and the dashboard. */
export async function listAirtimeCommitments(): Promise<
  (BkAirtimeCommitmentRow & { project_title: string; project_disposition: string | null })[]
> {
  const supabase = await createClient();
  const result = await supabase.from("bk_airtime_commitments").select("*").order("starts_on");
  const rows = unwrapRead(result, "airtime commitments") ?? [];
  if (rows.length === 0) return [];
  const projects = await supabase
    .from("bk_projects")
    .select("id, title, disposition")
    .in("id", [...new Set(rows.map((row) => row.project_id))]);
  const byId = new Map((unwrapRead(projects, "requests") ?? []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    ...row,
    project_title: byId.get(row.project_id)?.title ?? "Request",
    project_disposition: byId.get(row.project_id)?.disposition ?? null,
  }));
}

/**
 * What an estimate is priced from: the version in use, its card snapshot,
 * its packages (for the parts a package line snapshots) and the assessment
 * share. Null when no version is in use or its card was never recorded.
 */
export interface PricingContext {
  version: BkVersionRow;
  card: BkRateCardLineRow[];
  packages: PackageWithParts[];
  classes: BkLaborClassRow[];
  /** The card snapshot's unit costs — what a package line adjusted on a project is priced from (§20.6). */
  unitCosts: Tables["bk_rate_card_unit_costs"]["Row"][];
  assessmentShare: number;
  externalMarginShare: number;
}

export async function getPricingContext(versionId?: string | null): Promise<PricingContext | null> {
  const versions = await listVersions();
  const version = versionId
    ? (versions.find((v) => v.id === versionId) ?? null)
    : (versions.find((v) => v.in_use) ?? null);
  if (!version) return null;
  const supabase = await createClient();
  const [card, detail, unitCosts] = await Promise.all([
    listRateCardLines(version.id),
    getVersionDetail(version),
    supabase.from("bk_rate_card_unit_costs").select("*").eq("version_id", version.id),
  ]);
  if (card.length === 0) return null;
  const input = (key: string) =>
    Number(detail.assumptions.find((a) => a.kind === "model_input" && a.key === key)?.value ?? 0);
  return {
    version,
    card,
    packages: detail.packages,
    classes: detail.classes,
    unitCosts: unwrapRead(unitCosts, "rate card unit costs") ?? [],
    assessmentShare: input("assessment_share"),
    externalMarginShare: input("external_margin_share"),
  };
}

/** The second airtime boundary read (docs/bookings-design.md §6.5); a failed read is reported, not hidden. */
export async function readAirtimeHonored(
  planId: string,
): Promise<{ payload: unknown; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bk_institutional_airtime_honored", {
    p_plan_id: planId,
  });
  if (error) return { payload: null, error: error.message };
  if (data && "error" in data) return { payload: null, error: String(data.error) };
  return { payload: data, error: null };
}

/** Every member of the tool, by name — for the project's owner picker. */
export async function listBookingsMembers(
  toolId: string,
): Promise<{ id: string; displayName: string }[]> {
  const supabase = await createClient();
  const grants =
    unwrapRead(
      await supabase
        .from("tool_access")
        .select("user_id")
        .eq("tool_id", toolId)
        .is("revoked_at", null),
      "the list of tool members",
    ) ?? [];
  if (grants.length === 0) return [];
  const names = await displayNames(grants.map((grant) => grant.user_id));
  return grants
    .map((grant) => ({ id: grant.user_id, displayName: names.get(grant.user_id) ?? "A colleague" }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The active term plan, or null. */
export async function getActivePlan(): Promise<BkTermPlanRow | null> {
  const plans = await listPlans();
  return plans.find((plan) => plan.status === "active") ?? null;
}

/** The public intake form's settings (slice 4) — the singleton row; staff read it through RLS. */
export async function getIntakeSettings(): Promise<BkSettingsRow> {
  const supabase = await createClient();
  const result = await supabase.from("bk_settings").select("*").eq("id", true).maybeSingle();
  const row = unwrapRead(result, "intake settings");
  if (!row)
    throw new Error(
      "The intake settings row is missing — has 20261006130000_bookings_public_intake.sql been applied?",
    );
  return row;
}

// Partners and agreements (slice 5) -------------------------------------------------------------------

export type BkAgreementRow = Tables["bk_agreements"]["Row"];
export type BkReservedBlockRow = Tables["bk_reserved_blocks"]["Row"];

export type PartnerListView = "all" | BkPartnerRow["kind"];

export interface PartnerListItem extends BkPartnerRow {
  /** Agreements not ended. */
  agreement_count: number;
  active_agreement_count: number;
  /** Projects with no disposition, not settled. */
  open_project_count: number;
}

function partnerFilters(view: PartnerListView): [string, string, string][] {
  return view === "all" ? [] : [["kind", "eq", view]];
}

function escapeLike(q: string): string {
  return q.replace(/[%_]/g, "");
}

/** One page of partners, filtered and searched in the query (docs/ui-patterns.md, "Pagination"), by name. */
export async function listPartnersPage(options: {
  view: PartnerListView;
  q: string | null;
  page: number;
}): Promise<{ rows: PartnerListItem[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(options.page);
  let query = supabase.from("bk_partners").select("*", { count: "exact" });
  for (const [column, operator, value] of partnerFilters(options.view)) {
    query = query.filter(column, operator, value);
  }
  if (options.q) query = query.ilike("name", `%${escapeLike(options.q)}%`);
  const result = await query.order("name").order("id").range(from, to);
  if (result.error?.code === "PGRST103") {
    return { rows: [], total: await countPartners(options.view, options.q) };
  }
  const rows = unwrapRead(result, "partners") ?? [];
  if (rows.length === 0) return { rows: [], total: result.count ?? 0 };
  const ids = rows.map((row) => row.id);
  const [agreements, projects] = await Promise.all([
    supabase.from("bk_agreements").select("partner_id, status").in("partner_id", ids),
    supabase
      .from("bk_projects")
      .select("partner_id")
      .in("partner_id", ids)
      .is("disposition", null)
      .neq("stage", "settled"),
  ]);
  const agreementRows = unwrapRead(agreements, "agreements") ?? [];
  const projectRows = unwrapRead(projects, "open requests") ?? [];
  return {
    rows: rows.map((row) => ({
      ...row,
      agreement_count: agreementRows.filter((a) => a.partner_id === row.id && a.status !== "ended")
        .length,
      active_agreement_count: agreementRows.filter(
        (a) => a.partner_id === row.id && a.status === "active",
      ).length,
      open_project_count: projectRows.filter((p) => p.partner_id === row.id).length,
    })),
    total: result.count ?? 0,
  };
}

export async function countPartners(view: PartnerListView, q: string | null): Promise<number> {
  const supabase = await createClient();
  let query = supabase.from("bk_partners").select("id", { count: "exact", head: true });
  for (const [column, operator, value] of partnerFilters(view)) {
    query = query.filter(column, operator, value);
  }
  if (q) query = query.ilike("name", `%${escapeLike(q)}%`);
  const result = await query;
  unwrapRead(result, "partner count");
  return result.count ?? 0;
}

export async function getPartner(id: string): Promise<BkPartnerRow | null> {
  const supabase = await createClient();
  const result = await supabase.from("bk_partners").select("*").eq("id", id).maybeSingle();
  return unwrapRead(result, "partner");
}

/** A partner's agreements, latest first. */
export async function listAgreementsForPartner(partnerId: string): Promise<BkAgreementRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_agreements")
    .select("*")
    .eq("partner_id", partnerId)
    .order("starts_on", { ascending: false });
  return unwrapRead(result, "agreements") ?? [];
}

/** A partner's projects, newest first, for the partner page. */
export async function listProjectsForPartner(partnerId: string): Promise<BkProjectRow[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_projects")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false });
  return unwrapRead(result, "requests") ?? [];
}

/** Reserved blocks dated inside a range, with the agreement facts the booking rule reads. */
export async function listReservedBlocksBetween(
  startsOn: string,
  endsOn: string,
): Promise<CalendarReservedBlock[]> {
  const supabase = await createClient();
  const blocks =
    unwrapRead(
      await supabase
        .from("bk_reserved_blocks")
        .select("*")
        .gte("date", startsOn)
        .lte("date", endsOn)
        .order("date")
        .order("window_start"),
      "reserved blocks",
    ) ?? [];
  return withAgreementFacts(blocks);
}

async function withAgreementFacts(blocks: BkReservedBlockRow[]): Promise<CalendarReservedBlock[]> {
  if (blocks.length === 0) return [];
  const supabase = await createClient();
  const agreementIds = [...new Set(blocks.map((b) => b.agreement_id))];
  const agreements =
    unwrapRead(
      await supabase
        .from("bk_agreements")
        .select("id, label, status, release_deadline_days, partner_id")
        .in("id", agreementIds),
      "agreements",
    ) ?? [];
  const partners = await partnersById(agreements.map((a) => a.partner_id));
  const byId = new Map(agreements.map((a) => [a.id, a]));
  return blocks.flatMap((block) => {
    const agreement = byId.get(block.agreement_id);
    if (!agreement) return [];
    return [
      {
        ...block,
        agreement_label: agreement.label,
        agreement_status: agreement.status,
        release_deadline_days: Number(agreement.release_deadline_days),
        partner_id: agreement.partner_id,
        partner_name: partners.get(agreement.partner_id)?.name ?? "Partner",
      },
    ];
  });
}

export interface ReservedBlockDetail extends BkReservedBlockRow {
  state: ReservedBlockState;
  pool_name: string;
  project_title: string | null;
  kept_by_name: string | null;
}

export interface AgreementDetail {
  agreement: BkAgreementRow;
  partner: BkPartnerRow;
  blocks: ReservedBlockDetail[];
  /** Projects under the agreement, newest first. */
  projects: BkProjectRow[];
  consumption: AgreementConsumption;
  /** Bespoke packages scoped to this agreement, on the version in use. */
  packages: { id: string; name: string; unit_label: string; version_label: string }[];
  approved_by_name: string | null;
  pools: BkPoolRow[];
  classes: BkLaborClassRow[];
}

export async function getAgreementDetail(id: string): Promise<AgreementDetail | null> {
  const supabase = await createClient();
  const agreement = unwrapRead(
    await supabase.from("bk_agreements").select("*").eq("id", id).maybeSingle(),
    "agreement",
  );
  if (!agreement) return null;
  const today = stationTodayISO();
  const [partner, blocks, projects, pools, classes, packages] = await Promise.all([
    supabase.from("bk_partners").select("*").eq("id", agreement.partner_id).maybeSingle(),
    supabase
      .from("bk_reserved_blocks")
      .select("*")
      .eq("agreement_id", id)
      .order("date")
      .order("window_start"),
    supabase
      .from("bk_projects")
      .select("*")
      .eq("agreement_id", id)
      .order("created_at", { ascending: false }),
    listPools(),
    listLaborClasses(),
    supabase
      .from("bk_service_packages")
      .select("id, name, unit_label, version_id")
      .eq("agreement_id", id)
      .order("sort_order"),
  ]);
  const partnerRow = unwrapRead(partner, "partner");
  if (!partnerRow) return null;
  const blockRows = unwrapRead(blocks, "reserved blocks") ?? [];
  const projectRows = unwrapRead(projects, "requests") ?? [];
  const packageRows = unwrapRead(packages, "bespoke packages") ?? [];
  const versionIds = [...new Set(packageRows.map((p) => p.version_id))];
  const [consumption, names, versions] = await Promise.all([
    agreementConsumptionFor(agreement, projectRows),
    displayNames([agreement.approved_by, ...blockRows.map((b) => b.kept_by)]),
    versionIds.length > 0
      ? supabase.from("bk_rate_model_versions").select("id, label").in("id", versionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const versionLabel = new Map(
    (unwrapRead(versions, "rate model versions") ?? []).map((v) => [v.id, v.label]),
  );
  const projectTitle = new Map(projectRows.map((p) => [p.id, p.title]));
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  return {
    agreement,
    partner: partnerRow,
    blocks: blockRows.map((block) => ({
      ...block,
      state: reservedBlockState(block, agreement, today),
      pool_name: poolName.get(block.pool_id) ?? "Pool",
      project_title: block.project_id ? (projectTitle.get(block.project_id) ?? null) : null,
      kept_by_name: block.kept_by ? (names.get(block.kept_by) ?? null) : null,
    })),
    projects: projectRows,
    consumption,
    packages: packageRows.map((p) => ({
      id: p.id,
      name: p.name,
      unit_label: p.unit_label,
      version_label: versionLabel.get(p.version_id) ?? "",
    })),
    approved_by_name: agreement.approved_by ? (names.get(agreement.approved_by) ?? null) : null,
    pools,
    classes,
  };
}

/**
 * What an agreement's projects have drawn (lib/bookings/agreements.ts's
 * agreementConsumption over the live rows): the live bookings of every
 * project under it, the contributed commitments of its open projects, and
 * its blocks. `excludeProjectId` leaves one project out, for re-pricing it.
 */
export async function agreementConsumptionFor(
  agreement: BkAgreementRow,
  projects?: BkProjectRow[],
  excludeProjectId?: string,
): Promise<AgreementConsumption> {
  const supabase = await createClient();
  const projectRows =
    projects ??
    unwrapRead(
      await supabase.from("bk_projects").select("*").eq("agreement_id", agreement.id),
      "requests",
    ) ??
    [];
  const projectIds = projectRows.map((p) => p.id);
  const openIds = projectRows.filter((p) => p.disposition === null).map((p) => p.id);
  const nowISO = new Date().toISOString();
  const [bookings, commitments, blocks, classes] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("bk_bookings")
          .select("*")
          .in("project_id", projectIds)
          .in("status", ["tentative", "confirmed"])
      : Promise.resolve({ data: [], error: null }),
    openIds.length > 0
      ? supabase.from("bk_airtime_commitments").select("*").in("project_id", openIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("bk_reserved_blocks").select("*").eq("agreement_id", agreement.id),
    listLaborClasses(),
  ]);
  const bookingRows = (unwrapRead(bookings, "bookings") ?? []).filter((b) =>
    bookingIsLive(
      { ...b, hours: {}, window_start: b.window_start, window_end: b.window_end },
      nowISO,
    ),
  );
  const labor =
    bookingRows.length > 0
      ? (unwrapRead(
          await supabase
            .from("bk_booking_labor")
            .select("*")
            .in(
              "booking_id",
              bookingRows.map((b) => b.id),
            ),
          "booking labor",
        ) ?? [])
      : [];
  return agreementConsumption({
    agreement,
    bookings: bookingRows.map((b) => ({
      project_id: b.project_id,
      treatment: b.treatment,
      hours: hoursByClass(labor.filter((row) => row.booking_id === b.id)),
    })),
    classes,
    commitments: unwrapRead(commitments, "airtime commitments") ?? [],
    blocks: unwrapRead(blocks, "reserved blocks") ?? [],
    todayISO: stationTodayISO(nowISO),
    excludeProjectId,
  });
}

/** Every agreement not ended, with its blocks — for the dashboard's action items. */
export async function listAgreementsWithBlocks(): Promise<
  (BkAgreementRow & { blocks: BkReservedBlockRow[] })[]
> {
  const supabase = await createClient();
  const agreements =
    unwrapRead(
      await supabase
        .from("bk_agreements")
        .select("*")
        .neq("status", "ended")
        .order("starts_on", { ascending: false }),
      "agreements",
    ) ?? [];
  if (agreements.length === 0) return [];
  const blocks =
    unwrapRead(
      await supabase
        .from("bk_reserved_blocks")
        .select("*")
        .in(
          "agreement_id",
          agreements.map((a) => a.id),
        ),
      "reserved blocks",
    ) ?? [];
  return agreements.map((agreement) => ({
    ...agreement,
    blocks: blocks.filter((b) => b.agreement_id === agreement.id),
  }));
}

/** The active agreements a partner's project may be put under, plus the one it already names. */
export async function listAgreementChoices(
  partnerId: string,
  currentId: string | null,
): Promise<BkAgreementRow[]> {
  const agreements = await listAgreementsForPartner(partnerId);
  return agreements.filter((a) => a.status === "active" || a.id === currentId);
}

/** The blocks of a project's agreement it could still take: reserved or kept, not yet attached. */
export async function listAttachableBlocks(
  agreement: BkAgreementRow,
): Promise<ReservedBlockDetail[]> {
  const supabase = await createClient();
  const today = stationTodayISO();
  const [blocks, pools] = await Promise.all([
    supabase
      .from("bk_reserved_blocks")
      .select("*")
      .eq("agreement_id", agreement.id)
      .is("project_id", null)
      .is("released_at", null)
      .gte("date", today)
      .order("date")
      .order("window_start"),
    listPools(),
  ]);
  const poolName = new Map(pools.map((p) => [p.id, p.name]));
  return (unwrapRead(blocks, "reserved blocks") ?? [])
    .map((block) => ({
      ...block,
      state: reservedBlockState(block, agreement, today),
      pool_name: poolName.get(block.pool_id) ?? "Pool",
      project_title: null,
      kept_by_name: null,
    }))
    .filter((block) => block.state === "reserved" || block.state === "kept");
}

/** Every agreement not ended, with its partner's name — the package form's scoping options (slice 5). */
export async function listAgreementOptions(): Promise<
  { id: string; label: string; partner_name: string; status: BkAgreementRow["status"] }[]
> {
  const supabase = await createClient();
  const agreements =
    unwrapRead(
      await supabase
        .from("bk_agreements")
        .select("id, label, status, partner_id")
        .neq("status", "ended")
        .order("label"),
      "agreements",
    ) ?? [];
  const partners = await partnersById(agreements.map((a) => a.partner_id));
  return agreements
    .map((a) => ({
      id: a.id,
      label: a.label,
      status: a.status,
      partner_name: partners.get(a.partner_id)?.name ?? "Partner",
    }))
    .sort((a, b) => a.partner_name.localeCompare(b.partner_name) || a.label.localeCompare(b.label));
}

// Badge facts for a page of projects (docs/bookings-design.md §18.7) ---------------------------------

/** What the Requests list needs beyond the project rows to decide each row's badges. */
export async function listProjectDateFacts(
  projectIds: readonly string[],
): Promise<Map<string, ProjectDateFacts>> {
  const facts = new Map<string, ProjectDateFacts>();
  if (projectIds.length === 0) return facts;
  const supabase = await createClient();
  const [lines, bookings] = await Promise.all([
    supabase
      .from("bk_estimate_lines")
      .select(
        "project_id, kind, package_id, labor_hours, resource_units, recipe_labor_hours, recipe_resource_units, adjustment_reason",
      )
      .in("project_id", [...projectIds])
      .eq("kind", "package"),
    supabase
      .from("bk_bookings")
      .select("project_id, status, exception_reason")
      .in("project_id", [...projectIds]),
  ]);
  const lineRows = unwrapRead(lines, "estimate lines") ?? [];
  const bookingRows = unwrapRead(bookings, "dates") ?? [];
  const packageIds = [
    ...new Set(lineRows.map((row) => row.package_id).filter((id): id is string => !!id)),
  ];
  const scoped = new Set<string>();
  if (packageIds.length > 0) {
    const packages = await supabase
      .from("bk_service_packages")
      .select("id, agreement_id")
      .in("id", packageIds)
      .not("agreement_id", "is", null);
    for (const row of unwrapRead(packages, "packages") ?? []) scoped.add(row.id);
  }
  for (const id of projectIds) {
    facts.set(id, {
      hasPackageLine: false,
      openBookings: 0,
      bookingException: false,
      scopeAdjusted: false,
      customPackage: false,
    });
  }
  for (const row of lineRows) {
    const entry = facts.get(row.project_id)!;
    entry.hasPackageLine = true;
    if (
      isAdjusted({
        ...row,
        labor_hours: row.labor_hours ?? {},
        resource_units: row.resource_units ?? {},
      })
    ) {
      entry.scopeAdjusted = true;
    }
    if (row.package_id && scoped.has(row.package_id)) entry.customPackage = true;
  }
  for (const row of bookingRows) {
    if (!row.project_id) continue;
    const entry = facts.get(row.project_id);
    if (!entry) continue;
    if (row.status !== "released") entry.openBookings += 1;
    if (row.exception_reason) entry.bookingException = true;
  }
  return facts;
}

// The term report (docs/bookings-design.md §19.3) -------------------------------------------------

/** Every priced project that belongs to the term, with its stored economics, partner name and per-line breakdown. */
export async function listReportProjects(term: {
  starts_on: string;
  ends_on: string;
}): Promise<ReportProject[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_projects")
    .select("*")
    .not("full_economic_cost", "is", null)
    .order("created_at", { ascending: false });
  const rows = (unwrapRead(result, "priced requests") ?? []).filter((row) => inTerm(row, term));
  const partners = await partnersById(rows.map((row) => row.partner_id));
  return rows.map((row) => ({
    id: row.id,
    partner_id: row.partner_id,
    partner_name: partners.get(row.partner_id)?.name ?? "Partner",
    priced_as: row.priced_as,
    stage: row.stage,
    closed: row.disposition !== null,
    qualifies_strategic: row.qualifies_strategic,
    reserve_depleted: row.reserve_depleted,
    full_economic_cost: row.full_economic_cost === null ? null : Number(row.full_economic_cost),
    partner_recovery: row.partner_recovery === null ? null : Number(row.partner_recovery),
    wuwf_contribution: row.wuwf_contribution === null ? null : Number(row.wuwf_contribution),
    external_margin: row.external_margin === null ? null : Number(row.external_margin),
    external_assessment: row.external_assessment === null ? null : Number(row.external_assessment),
    lines: (row.economics?.lines ?? []) as LineEconomics[],
  }));
}

// Capital and the double-count check (docs/bookings-design.md §20.3, §20.4) ---------------------------------

/** The specific assets each budget line (by assumption id) already funds for replacement. */
export async function listFundedAssets(
  assumptionIds: readonly string[],
): Promise<Map<string, string[]>> {
  const funded = new Map<string, string[]>();
  if (assumptionIds.length === 0) return funded;
  const supabase = await createClient();
  const result = await supabase
    .from("bk_assumption_assets")
    .select("*")
    .in("assumption_id", [...assumptionIds]);
  for (const row of unwrapRead(result, "funded assets") ?? []) {
    funded.set(row.assumption_id, [...(funded.get(row.assumption_id) ?? []), row.asset_id]);
  }
  return funded;
}

// Assumed versus observed (docs/bookings-design.md §20.8) ----------------------------------------------------

/** Delivered projects' confirmed figures with their lines, and the term's refusals and releases. */
export async function listObservedInputs(plan: {
  id: string;
  starts_on: string;
  ends_on: string;
}): Promise<{ projects: ObservedProject[]; events: BookingEventLike[] }> {
  const supabase = await createClient();
  const [used, events] = await Promise.all([
    supabase.from("bk_hours_used").select("*"),
    supabase.from("bk_booking_events").select("pool_id, kind").eq("plan_id", plan.id),
  ]);
  const usedRows = unwrapRead(used, "confirmed hours") ?? [];
  const projectIds = [...new Set(usedRows.map((row) => row.project_id))];
  let projects: ObservedProject[] = [];
  if (projectIds.length > 0) {
    const [projectRows, lineRows] = await Promise.all([
      supabase.from("bk_projects").select("id, event_starts_on, created_at").in("id", projectIds),
      supabase.from("bk_estimate_lines").select("*").in("project_id", projectIds),
    ]);
    const inTermIds = new Set(
      (unwrapRead(projectRows, "projects") ?? []).filter((p) => inTerm(p, plan)).map((p) => p.id),
    );
    const lines = unwrapRead(lineRows, "estimate lines") ?? [];
    projects = [...inTermIds].map((id) => ({
      id,
      lines: lines
        .filter((l) => l.project_id === id)
        .map((l) => ({
          kind: l.kind,
          package_id: l.package_id,
          label: l.label,
          quantity: Number(l.quantity),
          labor_hours: l.labor_hours ?? {},
          resource_units: l.resource_units ?? {},
          recipe_labor_hours: l.recipe_labor_hours,
          recipe_resource_units: l.recipe_resource_units,
        })),
      confirmed: usedRows
        .filter((row) => row.project_id === id)
        .map((row) => ({
          kind: row.kind,
          id: (row.kind === "labor" ? row.labor_class_id : row.pool_id) ?? "",
          planned: Number(row.planned),
          used: Number(row.used),
        })),
    }));
  }
  return {
    projects,
    events: (unwrapRead(events, "booking events") ?? []).map((e) => ({
      pool_id: e.pool_id,
      kind: e.kind,
    })),
  };
}

/** What a delivered project has already had confirmed, for its page. */
export async function listHoursUsed(projectId: string) {
  const supabase = await createClient();
  const result = await supabase.from("bk_hours_used").select("*").eq("project_id", projectId);
  return unwrapRead(result, "confirmed hours") ?? [];
}

// Settlement (docs/bookings-design.md §21) -------------------------------------------------------------------

/** A project's settlement, drafted or posted; null until one is drafted. */
export async function getSettlement(projectId: string): Promise<BkSettlementRow | null> {
  const supabase = await createClient();
  const result = await supabase
    .from("bk_settlements")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return unwrapRead(result, "settlement");
}

/** The term's posted settlements, for the report's actual-versus-estimated section. */
export async function listSettledForReport(term: {
  starts_on: string;
  ends_on: string;
}): Promise<SettledProject[]> {
  const supabase = await createClient();
  const settlements = unwrapRead(
    await supabase.from("bk_settlements").select("*").eq("status", "posted"),
    "settlements",
  );
  if (!settlements || settlements.length === 0) return [];
  const projects = unwrapRead(
    await supabase
      .from("bk_projects")
      .select("id, title, partner_id, event_starts_on, created_at")
      .in(
        "id",
        settlements.map((s) => s.project_id),
      ),
    "settled requests",
  );
  const inTermProjects = (projects ?? []).filter((p) => inTerm(p, term));
  const partners = await partnersById(inTermProjects.map((p) => p.partner_id));
  return inTermProjects.flatMap((project) => {
    const settlement = settlements.find((s) => s.project_id === project.id);
    if (!settlement) return [];
    return [
      {
        id: project.id,
        title: project.title,
        partner_name: partners.get(project.partner_id)?.name ?? "Partner",
        kind: settlement.kind,
        amount: Number(settlement.amount),
        estimated_recovery: Number(settlement.estimated_recovery),
        estimated_full_cost:
          settlement.estimated_full_cost === null ? null : Number(settlement.estimated_full_cost),
        estimated_contribution:
          settlement.estimated_contribution === null
            ? null
            : Number(settlement.estimated_contribution),
        actual_full_cost: Number(settlement.actual_full_cost),
        wuwf_contribution: Number(settlement.wuwf_contribution),
        assessment_amount: Number(settlement.assessment_amount),
        external_margin: Number(settlement.external_margin),
      },
    ];
  });
}
