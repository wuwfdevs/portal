import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { RundownOpportunityLike } from "@/lib/log/rundown-generation";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { isScheduleEntryActiveOn } from "@/lib/log/schedule";
import { stationTodayISO } from "@/lib/log/timezone";
import type { Database } from "@/lib/database.types";

/**
 * Data access for Log. Every read goes through the RLS-scoped server client,
 * so private.has_log_access is what actually decides what comes back — these
 * functions add shape, not authorization. Reads are unwrapped rather than
 * defaulted to `[]`, per CLAUDE.md: a query that errors and falls back to
 * empty renders exactly like a healthy empty state.
 */

export type LogProgramRow = Database["public"]["Tables"]["log_programs"]["Row"];
export type LogClockTemplateRow = Database["public"]["Tables"]["log_clock_templates"]["Row"];
export type LogClockVersionRow = Database["public"]["Tables"]["log_clock_versions"]["Row"];
export type LogClockSlotRow = Database["public"]["Tables"]["log_clock_slots"]["Row"];
export type LogLocalOpportunityRow = Database["public"]["Tables"]["log_local_opportunities"]["Row"];
export type LogScheduleRow = Database["public"]["Tables"]["log_schedule"]["Row"];
export type LogContentItemRow = Database["public"]["Tables"]["log_content_items"]["Row"];
export type LogContentComponentRow = Database["public"]["Tables"]["log_content_components"]["Row"];
export type LogOpportunityAssignmentRow = Database["public"]["Tables"]["log_opportunity_assignments"]["Row"];
export type LogNprEpisodeRow = Database["public"]["Tables"]["log_npr_episodes"]["Row"];
export type LogNprEpisodeItemRow = Database["public"]["Tables"]["log_npr_episode_items"]["Row"];
export type LogWeatherReadingRow = Database["public"]["Tables"]["log_weather_reading"]["Row"];
export type LogRundownRow = Database["public"]["Tables"]["log_rundowns"]["Row"];
export type LogRundownBreakRow = Database["public"]["Tables"]["log_rundown_breaks"]["Row"];
export type LogRundownItemRow = Database["public"]["Tables"]["log_rundown_items"]["Row"];
export type LogBroadcastEventRow = Database["public"]["Tables"]["log_broadcast_events"]["Row"];

export async function listPrograms(): Promise<LogProgramRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(await supabase.from("log_programs").select("*").order("name"), "the programs") ?? []
  );
}

export async function getProgram(id: string): Promise<LogProgramRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_programs").select("*").eq("id", id).maybeSingle(),
    "this program",
  );
}

export async function listClockTemplates(): Promise<LogClockTemplateRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("log_clock_templates").select("*").order("name"),
      "the clock templates",
    ) ?? []
  );
}

// Slot-keyed (2026-08-10): an opportunity's own row carries only slot_id,
// requirement, permitted_content_types — its offset/duration/label/timing
// are always the referenced slot's own, joined in here rather than
// duplicated, so they can never drift out of sync with the clock. See
// CLAUDE.md's dated note.
export interface LogLocalOpportunityWithSlot extends LogLocalOpportunityRow {
  slot: LogClockSlotRow;
}

/** Adapts a slot-joined opportunity row into the shape lib/log/rundown-generation.ts's pure functions expect — offset/duration/label/timing always come from the referenced slot. */
export function toRundownOpportunity(opportunity: LogLocalOpportunityWithSlot): RundownOpportunityLike {
  return {
    id: opportunity.id,
    slot_position: opportunity.slot.position,
    slot_label: opportunity.slot.label,
    requirement: opportunity.requirement,
    timing_mode: opportunity.slot.timing_mode,
    start_offset_seconds: opportunity.slot.start_offset_seconds,
    duration_seconds: opportunity.slot.duration_seconds,
    earliest_start_offset_seconds: opportunity.slot.earliest_start_offset_seconds,
    latest_start_offset_seconds: opportunity.slot.latest_start_offset_seconds,
    permitted_content_types: opportunity.permitted_content_types,
  };
}

export interface ClockVersionWithSlots extends LogClockVersionRow {
  slots: LogClockSlotRow[];
  opportunities: LogLocalOpportunityWithSlot[];
}

export interface ClockTemplateDetail extends LogClockTemplateRow {
  versions: ClockVersionWithSlots[];
}

/** A template plus every version it has ever had, each with its own network slots and WUWF local opportunities, newest first. */
export async function getClockTemplateDetail(id: string): Promise<ClockTemplateDetail | null> {
  const supabase = await createClient();
  const template = unwrapRead(
    await supabase.from("log_clock_templates").select("*").eq("id", id).maybeSingle(),
    "this clock template",
  );
  if (!template) return null;

  const versions =
    unwrapRead(
      await supabase
        .from("log_clock_versions")
        .select("*")
        .eq("clock_template_id", id)
        .order("effective_from", { ascending: false }),
      "this clock template's versions",
    ) ?? [];

  if (versions.length === 0) return { ...template, versions: [] };

  const versionIds = versions.map((version) => version.id);
  const [slots, rawOpportunities] = await Promise.all([
    unwrapRead(
      await supabase.from("log_clock_slots").select("*").in("clock_version_id", versionIds).order("position"),
      "this clock template's slots",
    ) ?? [],
    unwrapRead(
      await supabase
        .from("log_local_opportunities")
        .select("*")
        .in("clock_version_id", versionIds)
        .eq("active", true),
      "this clock template's local opportunities",
    ) ?? [],
  ]);

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  // Joined in application code, not a PostgREST embed — matches this
  // codebase's own convention throughout (getRundownDetail, etc.); the
  // hand-maintained database.types.ts carries no Relationships metadata for
  // embeds to type-check against.
  const opportunities: LogLocalOpportunityWithSlot[] = rawOpportunities.flatMap((opportunity) => {
    const slot = slotById.get(opportunity.slot_id);
    return slot ? [{ ...opportunity, slot }] : [];
  });
  // Chronological, not authoring order — an opportunity carries no position
  // of its own anymore; its referenced slot's start_offset_seconds is the
  // only honest ordering key (see listLocalOpportunitiesForVersion's own
  // comment for the real Morning Edition mismatch this avoids).
  opportunities.sort(
    (a, b) => (a.slot.start_offset_seconds ?? 0) - (b.slot.start_offset_seconds ?? 0),
  );

  const slotsByVersion = new Map<string, LogClockSlotRow[]>();
  for (const slot of slots) {
    const existing = slotsByVersion.get(slot.clock_version_id);
    if (existing) existing.push(slot);
    else slotsByVersion.set(slot.clock_version_id, [slot]);
  }
  const opportunitiesByVersion = new Map<string, LogLocalOpportunityWithSlot[]>();
  for (const opportunity of opportunities) {
    const existing = opportunitiesByVersion.get(opportunity.clock_version_id);
    if (existing) existing.push(opportunity);
    else opportunitiesByVersion.set(opportunity.clock_version_id, [opportunity]);
  }

  return {
    ...template,
    versions: versions.map((version) => ({
      ...version,
      slots: slotsByVersion.get(version.id) ?? [],
      opportunities: opportunitiesByVersion.get(version.id) ?? [],
    })),
  };
}

export interface ScheduleEntryWithNames extends LogScheduleRow {
  programName: string;
  clockTemplateName: string;
}

/** Every schedule entry, with the program/clock template names the screens display. */
export async function listScheduleEntries(): Promise<ScheduleEntryWithNames[]> {
  const supabase = await createClient();
  const [entries, programs, templates] = await Promise.all([
    unwrapRead(
      await supabase.from("log_schedule").select("*").order("start_date", { ascending: false }),
      "the schedule",
    ) ?? [],
    listPrograms(),
    listClockTemplates(),
  ]);

  const programNameById = new Map(programs.map((program) => [program.id, program.name]));
  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));

  return entries.map((entry) => ({
    ...entry,
    programName: programNameById.get(entry.program_id) ?? "Unknown program",
    clockTemplateName: templateNameById.get(entry.clock_template_id) ?? "Unknown clock",
  }));
}

/** Schedule entries for one program, most recent start date first. */
export async function listScheduleEntriesForProgram(programId: string): Promise<LogScheduleRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_schedule")
        .select("*")
        .eq("program_id", programId)
        .order("start_date", { ascending: false }),
      "this program's schedule",
    ) ?? []
  );
}

export interface ContentLibraryFilters {
  contentType?: LogContentItemRow["content_type"];
  approvalStatus?: LogContentItemRow["approval_status"];
}

/** The content library browse list — every item matching the given filters, newest first. */
export async function listContentItems(
  filters: ContentLibraryFilters = {},
): Promise<LogContentItemRow[]> {
  const supabase = await createClient();
  let query = supabase.from("log_content_items").select("*").order("created_at", { ascending: false });
  if (filters.contentType) query = query.eq("content_type", filters.contentType);
  if (filters.approvalStatus) query = query.eq("approval_status", filters.approvalStatus);
  return unwrapRead(await query, "the content library") ?? [];
}

export interface ContentItemDetail extends LogContentItemRow {
  components: LogContentComponentRow[];
}

/** One content item plus its components, in sequence order. */
export async function getContentItemDetail(id: string): Promise<ContentItemDetail | null> {
  const supabase = await createClient();
  const item = unwrapRead(
    await supabase.from("log_content_items").select("*").eq("id", id).maybeSingle(),
    "this content item",
  );
  if (!item) return null;

  const components =
    unwrapRead(
      await supabase
        .from("log_content_components")
        .select("*")
        .eq("content_item_id", id)
        .order("sequence"),
      "this content item's components",
    ) ?? [];

  return { ...item, components };
}

/**
 * Several content items plus their components at once, keyed by id — the
 * bulk counterpart to getContentItemDetail, used by
 * lib/log/opportunity-assignment-placement.ts so placing several assigned
 * items across a freshly-generated rundown's breaks doesn't do it one query
 * per item. Silently drops any id that no longer resolves (a deactivated or
 * deleted item an assignment still points at) rather than erroring — that
 * assignment just doesn't place anything this run, the same "best effort"
 * treatment placement already gives a failed write.
 */
export async function getContentItemsWithComponents(
  ids: string[],
): Promise<Map<string, ContentItemDetail>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const items =
    unwrapRead(
      await supabase.from("log_content_items").select("*").in("id", ids),
      "these content items",
    ) ?? [];
  const components =
    unwrapRead(
      await supabase.from("log_content_components").select("*").in("content_item_id", ids),
      "these content items' components",
    ) ?? [];

  const componentsByItem = new Map<string, LogContentComponentRow[]>();
  for (const component of components) {
    const existing = componentsByItem.get(component.content_item_id);
    if (existing) existing.push(component);
    else componentsByItem.set(component.content_item_id, [component]);
  }

  return new Map(
    items.map((item) => [
      item.id,
      { ...item, components: (componentsByItem.get(item.id) ?? []).sort((a, b) => a.sequence - b.sequence) },
    ]),
  );
}

export interface NprEpisodeCacheEntry {
  episode: LogNprEpisodeRow;
  items: LogNprEpisodeItemRow[];
}

/**
 * The cached NPR CDS program-episode for one program on one show date, if
 * one has ever been fetched — episode identity is (program, show_date), not
 * just program (docs/log-design.md §5: date is part of a CDS episode's
 * identity). Raw read only — see lib/log/npr.ts for the lazy-refresh read
 * that calls this.
 */
export async function getNprEpisodeCache(
  programId: string,
  showDateISO: string,
): Promise<NprEpisodeCacheEntry | null> {
  const supabase = await createClient();
  const episode = unwrapRead(
    await supabase
      .from("log_npr_episodes")
      .select("*")
      .eq("program_id", programId)
      .eq("show_date", showDateISO)
      .maybeSingle(),
    "this program's cached NPR episode",
  );
  if (!episode) return null;

  const items =
    unwrapRead(
      await supabase
        .from("log_npr_episode_items")
        .select("*")
        .eq("episode_id", episode.id)
        .order("position"),
      "this NPR episode's items",
    ) ?? [];

  return { episode, items };
}

/** The single current weather reading, if one has ever been fetched. Raw read only — see lib/log/weather.ts for the lazy-refresh read that calls this. */
export async function getCurrentWeatherReadingRow(): Promise<LogWeatherReadingRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_weather_reading").select("*").eq("is_current", true).maybeSingle(),
    "the current weather reading",
  );
}

// Rundowns ------------------------------------------------------------------

export async function getScheduleEntry(id: string): Promise<LogScheduleRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_schedule").select("*").eq("id", id).maybeSingle(),
    "this schedule entry",
  );
}

/** The slots belonging to one clock version, in position order — the network structure, for the clock face diagram. */
export async function listClockSlotsForVersion(clockVersionId: string): Promise<LogClockSlotRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_clock_slots")
        .select("*")
        .eq("clock_version_id", clockVersionId)
        .order("position"),
      "this clock version's slots",
    ) ?? []
  );
}

/**
 * The active local opportunities for one clock version, in chronological
 * order, each joined to the network slot it marks eligible — WUWF's own
 * overlay, for both the clock face diagram and rundown generation
 * (buildRundownBreakDrafts needs each opportunity's slot-derived offset/
 * duration/label/timing, since the opportunity itself carries none of its
 * own — see CLAUDE.md's dated note). Ordered by the referenced slot's own
 * start_offset_seconds, not any authored position: the real Morning Edition
 * seed itself has a case where a required local-ID opportunity was entered
 * after both story windows even though it airs between them, which
 * ordering by authoring order rendered out of chronological order
 * downstream.
 */
export async function listLocalOpportunitiesForVersion(
  clockVersionId: string,
): Promise<LogLocalOpportunityWithSlot[]> {
  const supabase = await createClient();
  const [rawOpportunities, slots] = await Promise.all([
    unwrapRead(
      await supabase
        .from("log_local_opportunities")
        .select("*")
        .eq("clock_version_id", clockVersionId)
        .eq("active", true),
      "this clock version's local opportunities",
    ) ?? [],
    listClockSlotsForVersion(clockVersionId),
  ]);
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const opportunities: LogLocalOpportunityWithSlot[] = rawOpportunities.flatMap((opportunity) => {
    const slot = slotById.get(opportunity.slot_id);
    return slot ? [{ ...opportunity, slot }] : [];
  });
  return opportunities.sort(
    (a, b) => (a.slot.start_offset_seconds ?? 0) - (b.slot.start_offset_seconds ?? 0),
  );
}

export interface OpportunityAssignmentWithContentTitle extends LogOpportunityAssignmentRow {
  contentItemTitle: string;
}

/**
 * Every active assignment (see lib/log/opportunity-assignments.ts) pinning
 * a content item to one of this clock version's local opportunities, for
 * the clock detail screen — joined to the content item's title since a bare
 * id isn't useful to a producer reading the list. Not scoped further by
 * opportunity; the caller groups by local_opportunity_id.
 */
export async function listOpportunityAssignmentsForVersion(
  clockVersionId: string,
): Promise<OpportunityAssignmentWithContentTitle[]> {
  const supabase = await createClient();
  const opportunities = await listLocalOpportunitiesForVersion(clockVersionId);
  const opportunityIds = opportunities.map((opportunity) => opportunity.id);
  if (opportunityIds.length === 0) return [];

  const assignments =
    unwrapRead(
      await supabase
        .from("log_opportunity_assignments")
        .select("*")
        .in("local_opportunity_id", opportunityIds)
        .eq("active", true),
      "this clock version's content assignments",
    ) ?? [];
  if (assignments.length === 0) return [];

  const contentItemIds = [...new Set(assignments.map((assignment) => assignment.content_item_id))];
  const items =
    unwrapRead(
      await supabase.from("log_content_items").select("id, title").in("id", contentItemIds),
      "these assignments' content items",
    ) ?? [];
  const titleById = new Map(items.map((item) => [item.id, item.title]));

  return assignments.map((assignment) => ({
    ...assignment,
    contentItemTitle: titleById.get(assignment.content_item_id) ?? "Unknown content item",
  }));
}

/** Every rundown for a given air date — the Today screen's per-program status column. */
export async function listRundownsForDate(airDateISO: string): Promise<LogRundownRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("log_rundowns").select("*").eq("air_date", airDateISO),
      "today's rundowns",
    ) ?? []
  );
}

/** The rundown already generated for this program on this date, if any — generation checks this first to stay idempotent. */
export async function getRundownForProgramOnDate(
  programId: string,
  airDateISO: string,
): Promise<LogRundownRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase
      .from("log_rundowns")
      .select("*")
      .eq("program_id", programId)
      .eq("air_date", airDateISO)
      .maybeSingle(),
    "this program's rundown",
  );
}

export interface RundownItemDetail extends LogRundownItemRow {
  contentItem: (LogContentItemRow & { components: LogContentComponentRow[] }) | null;
}

export interface RundownBreakDetail extends LogRundownBreakRow {
  items: RundownItemDetail[];
}

export interface RundownDetail extends LogRundownRow {
  programName: string;
  breaks: RundownBreakDetail[];
}

/**
 * A rundown plus every break, each with its placed items joined to their
 * content item and components. Breaks are ordered by `scheduled_at`, not
 * `position` — `position` is derived from the local opportunity's own
 * `position` (see listLocalOpportunitiesForVersion's comment) and is not
 * guaranteed to track chronological order, which made the rundown builder
 * and console render breaks out of time order for any clock whose
 * opportunities weren't authored in start-time order.
 */
export async function getRundownDetail(id: string): Promise<RundownDetail | null> {
  const supabase = await createClient();
  const rundown = unwrapRead(
    await supabase.from("log_rundowns").select("*").eq("id", id).maybeSingle(),
    "this rundown",
  );
  if (!rundown) return null;

  const [program, breaks] = await Promise.all([
    getProgram(rundown.program_id),
    unwrapRead(
      await supabase.from("log_rundown_breaks").select("*").eq("rundown_id", id).order("scheduled_at"),
      "this rundown's breaks",
    ) ?? [],
  ]);

  const breakIds = breaks.map((brk) => brk.id);
  const items =
    breakIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_rundown_items").select("*").in("break_id", breakIds).order("position"),
          "this rundown's items",
        ) ?? []);

  const contentItemIds = [...new Set(items.flatMap((item) => (item.content_item_id ? [item.content_item_id] : [])))];

  const [contentItems, components] = await Promise.all([
    contentItemIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_content_items").select("*").in("id", contentItemIds),
          "this rundown's content items",
        ) ?? []),
    contentItemIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_content_components").select("*").in("content_item_id", contentItemIds),
          "this rundown's content components",
        ) ?? []),
  ]);

  const contentItemById = new Map(contentItems.map((item) => [item.id, item]));
  const componentsByContentItem = new Map<string, LogContentComponentRow[]>();
  for (const component of components) {
    const existing = componentsByContentItem.get(component.content_item_id);
    if (existing) existing.push(component);
    else componentsByContentItem.set(component.content_item_id, [component]);
  }

  const itemsByBreak = new Map<string, RundownItemDetail[]>();
  for (const item of items) {
    const contentItem = item.content_item_id ? (contentItemById.get(item.content_item_id) ?? null) : null;
    const detail: RundownItemDetail = {
      ...item,
      contentItem: contentItem
        ? { ...contentItem, components: componentsByContentItem.get(contentItem.id) ?? [] }
        : null,
    };
    const existing = itemsByBreak.get(item.break_id);
    if (existing) existing.push(detail);
    else itemsByBreak.set(item.break_id, [detail]);
  }

  return {
    ...rundown,
    programName: program?.name ?? "Unknown program",
    breaks: breaks.map((brk) => ({ ...brk, items: itemsByBreak.get(brk.id) ?? [] })),
  };
}

export async function getRundownItem(id: string): Promise<LogRundownItemRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_rundown_items").select("*").eq("id", id).maybeSingle(),
    "this rundown item",
  );
}

export async function getRundownBreak(id: string): Promise<LogRundownBreakRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase.from("log_rundown_breaks").select("*").eq("id", id).maybeSingle(),
    "this break",
  );
}

/** Every item currently placed in one break, in position order. */
export async function listItemsForBreak(breakId: string): Promise<LogRundownItemRow[]> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.from("log_rundown_items").select("*").eq("break_id", breakId).order("position"),
      "this break's items",
    ) ?? []
  );
}

export interface UnderwritingCopyForLog {
  id: string;
  label: string;
  script: string | null;
  duration_seconds: number | null;
  execution_kind: string;
  cart_identifier: string | null;
}

/**
 * The approved underwriting script for a set of underwriting-credit items —
 * point 14 of the domain redesign: the host must never be told to go to
 * Underwriting & Traffic to read a credit's copy. Readable here because of
 * `uw_copy_select_for_log` (20260808200000_underwriting_redesign.sql), a
 * narrow additive policy scoped to exactly the copy rows already referenced
 * by a log_rundown_items row. Underwriting remains the source of truth —
 * this is a read, never a write.
 */
export async function listUnderwritingCopyForItems(copyIds: string[]): Promise<UnderwritingCopyForLog[]> {
  if (copyIds.length === 0) return [];
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("uw_copy")
        .select("id, label, script, duration_seconds, execution_kind, cart_identifier")
        .in("id", copyIds),
      "this rundown's underwriting copy",
    ) ?? []
  );
}

/**
 * Whether any underwriting credit in this rundown has an open, unresolved
 * uw_exceptions row — backs the submission attestation gate (page.tsx's
 * wrap-up panel, broadcast-actions.ts's submitRundown). Goes through
 * uw_has_open_exceptions_for_rundown(), a security-definer function owned
 * by Underwriting's own migration (20260809120000_uw_open_exceptions_for_
 * rundown.sql) — uw_exceptions' own RLS is scoped to underwriting access,
 * which most Log hosts don't have.
 */
export async function hasOpenUnderwritingExceptions(rundownId: string): Promise<boolean> {
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase.rpc("uw_has_open_exceptions_for_rundown", { p_rundown_id: rundownId }),
      "this rundown's underwriting exception status",
    ) ?? false
  );
}

/** Every broadcast event for a set of rundown items, most recent first — used to derive each item's confirmed/outcome state on the console. */
export async function listBroadcastEventsForItems(rundownItemIds: string[]): Promise<LogBroadcastEventRow[]> {
  if (rundownItemIds.length === 0) return [];
  const supabase = await createClient();
  return (
    unwrapRead(
      await supabase
        .from("log_broadcast_events")
        .select("*")
        .in("rundown_item_id", rundownItemIds)
        .order("recorded_at", { ascending: false }),
      "these rundown items' broadcast events",
    ) ?? []
  );
}

export interface ClockCapacityInput {
  clockTemplateId: string;
  clockTemplateName: string;
  programNames: string[];
  slots: LogClockSlotRow[];
  opportunities: LogLocalOpportunityWithSlot[];
}

/**
 * One entry per clock template actually scheduled today, with its current
 * version's full slot list and active local opportunities — everything
 * lib/log/inventory-report.ts's computeClockCapacity needs to split one
 * clock cycle into local-eligible vs. network seconds. Scoped to "today"
 * because log_local_opportunities isn't versioned (a plain `active`
 * boolean, editable in place) — there is no honest way to ask what was
 * configured as of a past date, only what's configured now. Several
 * schedule entries can share one clock template (e.g. a program's weekday
 * and Friday slots), so this groups by template and lists every program
 * name that currently uses it rather than assuming a 1:1 mapping.
 */
export async function listCurrentClockCapacityInputs(): Promise<ClockCapacityInput[]> {
  const supabase = await createClient();
  const today = stationTodayISO();

  const scheduleEntries = await listScheduleEntries();
  const activeToday = scheduleEntries.filter((entry) => isScheduleEntryActiveOn(entry, today));
  if (activeToday.length === 0) return [];

  const programNamesByTemplate = new Map<string, Set<string>>();
  for (const entry of activeToday) {
    const existing = programNamesByTemplate.get(entry.clock_template_id);
    if (existing) existing.add(entry.programName);
    else programNamesByTemplate.set(entry.clock_template_id, new Set([entry.programName]));
  }
  const templateIds = [...programNamesByTemplate.keys()];

  const versions =
    unwrapRead(
      await supabase.from("log_clock_versions").select("*").in("clock_template_id", templateIds),
      "these clock templates' versions",
    ) ?? [];

  const currentVersionByTemplate = new Map<string, LogClockVersionRow>();
  for (const templateId of templateIds) {
    const current = resolveCurrentVersion(
      versions.filter((version) => version.clock_template_id === templateId),
      today,
    );
    if (current) currentVersionByTemplate.set(templateId, current);
  }
  const versionIds = [...currentVersionByTemplate.values()].map((version) => version.id);
  if (versionIds.length === 0) return [];

  const [slots, rawOpportunities, templates] = await Promise.all([
    unwrapRead(
      await supabase.from("log_clock_slots").select("*").in("clock_version_id", versionIds),
      "these clocks' slots",
    ) ?? [],
    unwrapRead(
      await supabase
        .from("log_local_opportunities")
        .select("*")
        .in("clock_version_id", versionIds)
        .eq("active", true),
      "these clocks' active local opportunities",
    ) ?? [],
    unwrapRead(
      await supabase.from("log_clock_templates").select("*").in("id", templateIds),
      "these clock templates",
    ) ?? [],
  ]);

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const opportunities: LogLocalOpportunityWithSlot[] = rawOpportunities.flatMap((opportunity) => {
    const slot = slotById.get(opportunity.slot_id);
    return slot ? [{ ...opportunity, slot }] : [];
  });
  const templateNameById = new Map(templates.map((template) => [template.id, template.name]));

  return [...currentVersionByTemplate.entries()].map(([templateId, version]) => ({
    clockTemplateId: templateId,
    clockTemplateName: templateNameById.get(templateId) ?? "Unknown clock",
    programNames: [...(programNamesByTemplate.get(templateId) ?? [])].sort(),
    slots: slots.filter((slot) => slot.clock_version_id === version.id),
    opportunities: opportunities.filter((opportunity) => opportunity.clock_version_id === version.id),
  }));
}

export interface InventoryReportData {
  rundowns: LogRundownRow[];
  breaks: LogRundownBreakRow[];
  items: LogRundownItemRow[];
}

/**
 * Batched read for the inventory trend report (lib/log/inventory-report.ts's
 * computeInventoryTrend): every rundown generated in the date range
 * (optionally scoped to one program), with their breaks and placed items.
 * Three queries regardless of how many rundowns fall in range — same
 * batching discipline as getRundownDetail, just across many rundowns at
 * once instead of one.
 */
export async function listInventoryReportData(
  startDateISO: string,
  endDateISO: string,
  programId?: string,
): Promise<InventoryReportData> {
  const supabase = await createClient();

  let rundownsQuery = supabase
    .from("log_rundowns")
    .select("*")
    .gte("air_date", startDateISO)
    .lte("air_date", endDateISO);
  if (programId) rundownsQuery = rundownsQuery.eq("program_id", programId);

  const rundowns = unwrapRead(await rundownsQuery, "rundowns in this date range") ?? [];
  if (rundowns.length === 0) return { rundowns: [], breaks: [], items: [] };

  const rundownIds = rundowns.map((rundown) => rundown.id);
  const breaks =
    unwrapRead(
      await supabase.from("log_rundown_breaks").select("*").in("rundown_id", rundownIds),
      "these rundowns' breaks",
    ) ?? [];

  const breakIds = breaks.map((brk) => brk.id);
  const items =
    breakIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_rundown_items").select("*").in("break_id", breakIds),
          "these rundowns' placed items",
        ) ?? []);

  return { rundowns, breaks, items };
}
