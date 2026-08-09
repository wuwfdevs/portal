"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { buildRundownBreakDrafts, selectMissingBreakDrafts } from "@/lib/log/rundown-generation";
import { computeEffectiveDurationSeconds, WEATHER_ITEM_SENTINEL } from "@/lib/log/content-library";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import { invokeCapability } from "@/lib/capabilities/registry";
import { buildRundownItem } from "@/lib/log/capabilities";
import {
  getClockTemplateDetail,
  getContentItemDetail,
  getRundownBreak,
  getRundownDetail,
  getRundownForProgramOnDate,
  getRundownItem,
  getScheduleEntry,
  listItemsForBreak,
  listLocalOpportunitiesForVersion,
} from "@/lib/log/queries";
import { isValidMoveDestination, type RelocatableItemKind } from "@/lib/log/mid-broadcast";
import type { LogContentType } from "@/lib/database.types";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function rundownPath(id: string): string {
  return `/log/rundowns/${id}`;
}

/**
 * Generates (or, if one already exists, just links to) the rundown for a
 * schedule entry's program on a given air date — docs/log-design.md
 * Workflow E. Idempotent: log_rundowns' unique (program_id, air_date)
 * constraint backs this up at the database level too. Every local
 * opportunity gets a break (including optional ones, which render as
 * "carrying network" until something is placed) — see
 * lib/log/rundown-generation.ts.
 */
export async function generateRundown(formData: FormData): Promise<void> {
  await assertLogAccess();
  const scheduleEntryId = field(formData, "schedule_entry_id");
  const airDate = field(formData, "air_date");
  if (scheduleEntryId === "" || airDate === "")
    failWith("/log", "Choose a program to generate a rundown for.");

  const scheduleEntry = await getScheduleEntry(scheduleEntryId);
  if (!scheduleEntry) failWith("/log", "That schedule entry no longer exists.");

  const existing = await getRundownForProgramOnDate(scheduleEntry.program_id, airDate);
  if (existing) redirect(rundownPath(existing.id));

  const template = await getClockTemplateDetail(scheduleEntry.clock_template_id);
  const version = template ? resolveCurrentVersion(template.versions, airDate) : null;
  if (!version) failWith("/log", "This program's clock has no version in effect on that date.");

  const opportunities = await listLocalOpportunitiesForVersion(version.id);

  const shiftStartAt = stationLocalDateTimeToUTC(airDate, scheduleEntry.air_time);
  const shiftEndAt = new Date(
    new Date(shiftStartAt).getTime() + scheduleEntry.duration_minutes * 60_000,
  ).toISOString();

  const supabase = await createClient();
  const { data: rundown, error: rundownError } = await supabase
    .from("log_rundowns")
    .insert({
      program_id: scheduleEntry.program_id,
      schedule_entry_id: scheduleEntry.id,
      clock_version_id: version.id,
      air_date: airDate,
      shift_start_at: shiftStartAt,
      shift_end_at: shiftEndAt,
      status: "generated",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  failIfError(rundownError, "/log", "Could not generate the rundown");
  if (!rundown) failWith("/log", "Could not generate the rundown.");

  const drafts = buildRundownBreakDrafts(
    opportunities,
    shiftStartAt,
    scheduleEntry.duration_minutes,
  );
  if (drafts.length > 0) {
    // upsert + ignoreDuplicates against the unique (rundown_id,
    // local_opportunity_id, scheduled_at) constraint — not just a plain
    // insert — so a duplicate is impossible at the database level even
    // under a concurrent double-submit, not only when the application's own
    // "is this missing?" check gets it right. See
    // 20260808220000_log_rundown_breaks_dedup_and_unique.sql.
    const { error: breaksError } = await supabase.from("log_rundown_breaks").upsert(
      drafts.map((draft) => ({
        rundown_id: rundown.id,
        local_opportunity_id: draft.local_opportunity_id,
        position: draft.position,
        label: draft.label,
        requirement: draft.requirement,
        permitted_content_types: draft.permitted_content_types,
        allow_multiple: draft.allow_multiple,
        scheduled_at: draft.scheduled_at,
        available_duration_seconds: draft.available_duration_seconds,
        network_rejoin_at: draft.network_rejoin_at,
      })),
      { onConflict: "rundown_id,local_opportunity_id,scheduled_at", ignoreDuplicates: true },
    );
    failIfError(
      breaksError,
      "/log",
      "Rundown created, but its local-opportunity breaks could not be generated",
    );
  }

  revalidatePath("/log");
  redirect(rundownPath(rundown.id));
}

/**
 * Backfills any breaks a rundown is missing relative to its clock version's
 * *current* local opportunities — additive only, never touches an existing
 * break or its items. generateRundown() is idempotent on (program_id,
 * air_date): once a rundown row exists, generating again just redirects to
 * it rather than re-running generation, so a rundown created before a
 * producer added (or a migration seeded) an opportunity on its clock
 * version has no way to pick that opportunity up on its own — this is that
 * catch-up path. Safe to call repeatedly; a rundown already in sync simply
 * gets nothing inserted.
 */
export async function syncRundownBreaks(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const path = rundownPath(rundownId);

  const rundown = await getRundownDetail(rundownId);
  if (!rundown) failWith("/log", "That rundown no longer exists.");

  const opportunities = await listLocalOpportunitiesForVersion(rundown.clock_version_id);
  const shiftDurationMinutes = Math.round(
    (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) /
      60_000,
  );
  const drafts = buildRundownBreakDrafts(
    opportunities,
    rundown.shift_start_at,
    shiftDurationMinutes,
  );
  const missing = selectMissingBreakDrafts(drafts, rundown.breaks);

  if (missing.length > 0) {
    const supabase = await createClient();
    // Same upsert + ignoreDuplicates guard as generateRundown — belt and
    // braces alongside selectMissingBreakDrafts' own check, since two
    // concurrent clicks of "Sync them in now" could otherwise both compute
    // the same "missing" set before either write lands.
    const { error } = await supabase.from("log_rundown_breaks").upsert(
      missing.map((draft) => ({
        rundown_id: rundown.id,
        local_opportunity_id: draft.local_opportunity_id,
        position: draft.position,
        label: draft.label,
        requirement: draft.requirement,
        permitted_content_types: draft.permitted_content_types,
        allow_multiple: draft.allow_multiple,
        scheduled_at: draft.scheduled_at,
        available_duration_seconds: draft.available_duration_seconds,
        network_rejoin_at: draft.network_rejoin_at,
      })),
      { onConflict: "rundown_id,local_opportunity_id,scheduled_at", ignoreDuplicates: true },
    );
    failIfError(error, path, "Could not sync this rundown's breaks");
  }

  revalidatePath(path);
  redirect(path);
}

/**
 * One "add something to this break" workflow, not several — weather is
 * just another option in the same content_item_id select, identified by
 * WEATHER_ITEM_SENTINEL, rather than a separate button with its own form
 * and its own action. From a host's point of view there was never a good
 * reason for these to feel like different actions: both are "pick a thing,
 * put it in this open break." The underlying write still differs (weather
 * has no content_item_id — its effective text always comes from today's
 * current log_weather_reading unless overridden for this one airing, see
 * docs/log-design.md's per-airing override section), so that branch stays
 * a plain insert rather than being forced through the buildRundownItem
 * capability, which is specifically scoped to library content
 * (docs/log-design.md §6, `log.rundown.buildItem`'s own MCP-facing
 * contract: "Use log.content.search first to find an eligible item's id" —
 * that never applies to weather, so it stays outside that capability
 * rather than muddying its schema).
 */
export async function fillRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const contentItemId = field(formData, "content_item_id");
  const path = rundownPath(rundownId);
  if (contentItemId === "") failWith(path, "Choose something to add.");

  if (contentItemId === WEATHER_ITEM_SENTINEL) {
    const supabase = await createClient();
    const { data: existingItems, error: countError } = await supabase
      .from("log_rundown_items")
      .select("position")
      .eq("break_id", breakId);
    failIfError(countError, path, "Could not add weather");
    const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

    const { error } = await supabase.from("log_rundown_items").insert({
      break_id: breakId,
      position: nextPosition,
      item_kind: "weather",
      planned_duration_seconds: 20,
      placement_status: "editable",
    });
    failIfError(error, path, "Could not add weather");

    revalidatePath(path);
    redirect(path);
  }

  const result = await invokeCapability(buildRundownItem, { breakId, contentItemId });
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(path);
}

/**
 * Creates a one-off, ad-hoc item with no library content_item — "create a
 * new one-time item without leaving the rundown" (docs/log-design.md
 * Workflow E). Also how an NPR "look-ahead" gets made: the form's
 * "Use as look-ahead" picker (live-read-form.tsx) just pre-fills title/
 * script from an NPR story and stamps source_npr_item_id/
 * source_npr_item_title alongside — it's still an ordinary live_read item,
 * fully counted in the break's timing math, not a separate item_kind.
 */
export async function createLiveReadItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const title = field(formData, "title");
  const script = field(formData, "script");
  const durationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  const sourceNprItemId = field(formData, "source_npr_item_id");
  const sourceNprItemTitle = field(formData, "source_npr_item_title");
  const path = rundownPath(rundownId);
  if (title === "") failWith(path, "Give this live-read item a short title.");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    failWith(path, "Enter a duration in seconds.");

  const supabase = await createClient();
  const { data: existingItems, error: countError } = await supabase
    .from("log_rundown_items")
    .select("position")
    .eq("break_id", breakId);
  failIfError(countError, path, "Could not add this item");
  const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

  const { error } = await supabase.from("log_rundown_items").insert({
    break_id: breakId,
    position: nextPosition,
    item_kind: "live_read",
    live_read_title: title,
    live_read_script: script || null,
    planned_duration_seconds: durationSeconds,
    placement_status: "editable",
    source_npr_item_id: sourceNprItemId || null,
    source_npr_item_title: sourceNprItemTitle || null,
  });
  failIfError(error, path, "Could not add this item");

  revalidatePath(path);
  redirect(path);
}

/**
 * Removes a placed item from its break entirely — an ordinary delete now
 * that a break can hold several items, not "clear back to empty" (there is
 * no empty placeholder row anymore). Scoped to content/live_read/weather —
 * an underwriting-credit item is only ever removed through
 * log_clear_underwriting_credit() (see the Underwriting placement screen).
 */
export async function removeRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundown_items")
    .delete()
    .eq("id", itemId)
    .neq("item_kind", "underwriting_credit");
  failIfError(error, path, "Could not remove this item");

  revalidatePath(path);
  redirect(path);
}

/**
 * Per-airing overrides (docs/log-design.md's "durable content vs.
 * per-airing overrides") — never written back to the master log_content_item
 * or its components. Recomputes planned_duration_seconds from the master
 * components plus whichever overrides were given.
 */
export async function updateItemOverrides(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

  const parseOptionalInt = (name: string): number | null => {
    const raw = field(formData, name);
    if (raw === "") return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const overrideScript = field(formData, "override_script");
  const overrideNotes = field(formData, "override_notes");
  const overrideDurationSeconds = parseOptionalInt("override_duration_seconds");
  const overrideLiveIntroSeconds = parseOptionalInt("override_live_intro_seconds");
  const overrideLiveOutroSeconds = parseOptionalInt("override_live_outro_seconds");
  const overrideTagSeconds = parseOptionalInt("override_tag_seconds");

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase
    .from("log_rundown_items")
    .select("content_item_id")
    .eq("id", itemId)
    .single();
  failIfError(itemError, path, "Could not update this item");

  let plannedDurationSeconds: number | null = overrideDurationSeconds;
  if (plannedDurationSeconds === null && item?.content_item_id) {
    const contentItem = await getContentItemDetail(item.content_item_id);
    plannedDurationSeconds = contentItem
      ? computeEffectiveDurationSeconds(
          contentItem.components,
          contentItem.expected_duration_seconds,
          {
            override_live_intro_seconds: overrideLiveIntroSeconds,
            override_live_outro_seconds: overrideLiveOutroSeconds,
            override_tag_seconds: overrideTagSeconds,
          },
        )
      : null;
  }

  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      override_script: overrideScript || null,
      override_notes: overrideNotes || null,
      override_duration_seconds: overrideDurationSeconds,
      override_live_intro_seconds: overrideLiveIntroSeconds,
      override_live_outro_seconds: overrideLiveOutroSeconds,
      override_tag_seconds: overrideTagSeconds,
      ...(plannedDurationSeconds !== null
        ? { planned_duration_seconds: plannedDurationSeconds }
        : {}),
    })
    .eq("id", itemId);
  failIfError(error, path, "Could not update this item");

  revalidatePath(path);
  redirect(path);
}

/**
 * Called directly from the rundown breaks board's drag handler and its
 * keyboard/touch-accessible "Move to…" select — not a <form action>, for the
 * same reason academic-partnerships/actions.ts's setSubmissionStage isn't:
 * the board is already a client component (dnd-kit requires it) and a full
 * page navigation on every drop would defeat the point. Returns rather than
 * redirects so the client can update optimistically and roll back on error.
 *
 * Handles both a same-break reorder and a cross-break move with one write:
 * orderedItemIds is the destination break's complete item order after the
 * drop (including the moved item), renumbered 1..N. The source break's
 * other items are left exactly where they are — position doesn't need to
 * stay contiguous, only correctly ordered.
 *
 * "Moved" is now a plain rundown edit, not a broadcast outcome — see
 * lib/log/mid-broadcast.ts's file header. Nothing is written to
 * log_broadcast_events, and nothing is left behind at the old spot.
 * Underwriting credits are excluded entirely: they're relocated through
 * Underwriting & Traffic's own placement/makegood mechanism instead.
 */
export async function relocateRundownItem(
  itemId: string,
  destinationBreakId: string,
  orderedItemIds: string[],
): Promise<{ error?: string }> {
  await assertLogAccess();

  const item = await getRundownItem(itemId);
  if (!item) return { error: "That item no longer exists." };
  if (item.item_kind === "underwriting_credit") {
    return { error: "Underwriting credits are moved from the Underwriting & Traffic tool." };
  }

  const destinationBreak = await getRundownBreak(destinationBreakId);
  if (!destinationBreak) return { error: "That break no longer exists." };

  if (item.break_id !== destinationBreakId) {
    const destinationItems = await listItemsForBreak(destinationBreakId);
    const alreadyThere = destinationItems.filter((existing) => existing.id !== itemId);

    let kind: RelocatableItemKind = "live_read";
    let contentType: string | null = null;
    if (item.item_kind === "content" && item.content_item_id) {
      kind = "content";
      const contentItem = await getContentItemDetail(item.content_item_id);
      contentType = contentItem?.content_type ?? null;
    } else if (item.item_kind === "weather") {
      kind = "weather";
    }

    // nowISO is null here (not the "already in the past" gate) — that check
    // is a client-side UX hint only, same reasoning duration-fit warnings
    // use elsewhere in Log: the schema and this write don't need to enforce
    // it to stay correct. Capacity and content-type eligibility do.
    const eligible = isValidMoveDestination(
      {
        id: destinationBreak.id,
        scheduled_at: destinationBreak.scheduled_at,
        permitted_content_types: destinationBreak.permitted_content_types,
        allow_multiple: destinationBreak.allow_multiple,
        item_count: alreadyThere.length,
      },
      item.break_id,
      kind,
      contentType as LogContentType | null,
      null,
    );
    if (!eligible) return { error: "That break can't hold this item." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    orderedItemIds.map((id, index) =>
      supabase
        .from("log_rundown_items")
        .update({ break_id: destinationBreakId, position: index + 1 })
        .eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: "Could not move this item." };

  return {};
}
