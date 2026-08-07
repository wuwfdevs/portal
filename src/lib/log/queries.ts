import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
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
export type LogScheduleRow = Database["public"]["Tables"]["log_schedule"]["Row"];
export type LogContentItemRow = Database["public"]["Tables"]["log_content_items"]["Row"];
export type LogContentComponentRow = Database["public"]["Tables"]["log_content_components"]["Row"];
export type LogNprEpisodeRow = Database["public"]["Tables"]["log_npr_episodes"]["Row"];
export type LogNprEpisodeItemRow = Database["public"]["Tables"]["log_npr_episode_items"]["Row"];
export type LogWeatherReadingRow = Database["public"]["Tables"]["log_weather_reading"]["Row"];
export type LogRundownRow = Database["public"]["Tables"]["log_rundowns"]["Row"];
export type LogRundownItemRow = Database["public"]["Tables"]["log_rundown_items"]["Row"];

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

export interface ClockVersionWithSlots extends LogClockVersionRow {
  slots: LogClockSlotRow[];
}

export interface ClockTemplateDetail extends LogClockTemplateRow {
  versions: ClockVersionWithSlots[];
}

/** A template plus every version it has ever had, each with its own slots, newest first. */
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

  const slots =
    unwrapRead(
      await supabase
        .from("log_clock_slots")
        .select("*")
        .in(
          "clock_version_id",
          versions.map((version) => version.id),
        )
        .order("position"),
      "this clock template's slots",
    ) ?? [];

  const slotsByVersion = new Map<string, LogClockSlotRow[]>();
  for (const slot of slots) {
    const existing = slotsByVersion.get(slot.clock_version_id);
    if (existing) existing.push(slot);
    else slotsByVersion.set(slot.clock_version_id, [slot]);
  }

  return {
    ...template,
    versions: versions.map((version) => ({
      ...version,
      slots: slotsByVersion.get(version.id) ?? [],
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

/** The slots belonging to one clock version, in position order — the same shape getClockTemplateDetail nests per version. */
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
  slot: LogClockSlotRow;
  contentItem: (LogContentItemRow & { components: LogContentComponentRow[] }) | null;
}

export interface RundownDetail extends LogRundownRow {
  programName: string;
  items: RundownItemDetail[];
}

/** A rundown plus every item, each joined to its clock slot and (if filled) its content item and components. */
export async function getRundownDetail(id: string): Promise<RundownDetail | null> {
  const supabase = await createClient();
  const rundown = unwrapRead(
    await supabase.from("log_rundowns").select("*").eq("id", id).maybeSingle(),
    "this rundown",
  );
  if (!rundown) return null;

  const [program, items] = await Promise.all([
    getProgram(rundown.program_id),
    unwrapRead(
      await supabase.from("log_rundown_items").select("*").eq("rundown_id", id).order("position"),
      "this rundown's items",
    ) ?? [],
  ]);

  const slotIds = [...new Set(items.map((item) => item.clock_slot_id))];
  const contentItemIds = [...new Set(items.flatMap((item) => (item.content_item_id ? [item.content_item_id] : [])))];

  const [slots, contentItems, components] = await Promise.all([
    slotIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("log_clock_slots").select("*").in("id", slotIds),
          "this rundown's clock slots",
        ) ?? []),
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

  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const contentItemById = new Map(contentItems.map((item) => [item.id, item]));
  const componentsByContentItem = new Map<string, LogContentComponentRow[]>();
  for (const component of components) {
    const existing = componentsByContentItem.get(component.content_item_id);
    if (existing) existing.push(component);
    else componentsByContentItem.set(component.content_item_id, [component]);
  }

  return {
    ...rundown,
    programName: program?.name ?? "Unknown program",
    items: items.map((item) => {
      const slot = slotById.get(item.clock_slot_id);
      if (!slot) throw new Error(`Rundown item ${item.id} references a missing clock slot`);
      const contentItem = item.content_item_id ? (contentItemById.get(item.content_item_id) ?? null) : null;
      return {
        ...item,
        slot,
        contentItem: contentItem
          ? { ...contentItem, components: componentsByContentItem.get(contentItem.id) ?? [] }
          : null,
      };
    }),
  };
}
