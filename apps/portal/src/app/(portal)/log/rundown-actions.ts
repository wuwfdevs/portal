"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { field, optionalInt } from "@/lib/form-fields";
import { assertLogAccess, assertProgramDirector } from "@/lib/log/access";
import { deleteOrFail, failIfError, failWith } from "@/lib/editorial/action-result";
import { resolveCurrentVersion } from "@/lib/log/clock-versions";
import { resolveEntryInForce } from "@/lib/log/schedule";
import { findOutOfStepRundowns } from "@/lib/log/clock-sync";
import {
  BREAK_OCCURRENCE_CONFLICT,
  breakInsertRow,
  buildRundownBreakDrafts,
  selectMissingBreakDrafts,
} from "@/lib/log/rundown-generation";
import {
  CONTENT_TYPE_LABEL,
  computeEffectiveDurationSeconds,
  WEATHER_DEFAULT_DURATION_SECONDS,
  WEATHER_ITEM_SENTINEL,
} from "@/lib/log/content-library";
import { shiftDateISO, stationLocalDateTimeToUTC, stationTodayISO } from "@/lib/log/timezone";
import { estimateReadSeconds } from "@/lib/log/read-time";
import { invokeCapability } from "@/lib/capabilities/registry";
import { buildRundownItem } from "@/lib/log/capabilities";
import { placeAssignedContent } from "@/lib/log/opportunity-assignment-placement";
import {
  getClockTemplateDetail,
  getContentItemDetail,
  getRundownDetail,
  getRundownForProgramOnDate,
  getRundownItem,
  getScheduleEntry,
  listLocalOpportunitiesForVersion,
  listScheduleEntriesForProgram,
  listUpcomingRundownsWithClock,
  toRundownOpportunity,
} from "@/lib/log/queries";
import type { LogScheduleRow } from "@/lib/log/queries";
import type { LogContentType } from "@/lib/database.types";

function rundownPath(id: string): string {
  return `/log/rundowns/${id}`;
}

/**
 * The content type a host-authored live read is filed under when it's kept
 * in the library — host_created unless the form named another recognized
 * type (a read that's really a station promo or a PSA belongs under that).
 */
function libraryContentTypeFromForm(formData: FormData, path: string): LogContentType {
  const raw = field(formData, "library_content_type");
  if (raw === "") return "host_created";
  if (!(raw in CONTENT_TYPE_LABEL)) failWith(path, "That is not a recognized content type.");
  return raw as LogContentType;
}

/**
 * Writes a live read's title/script/duration to the library as a new,
 * immediately-approved content item, returning its id. Approved, not draft:
 * the eligibility filter (lib/log/rundown-eligibility.ts) only offers
 * approved items, so a draft would silently never appear in tomorrow's
 * picker and "keep this" would read as broken. Content authorship is
 * already open to every tool member with no producer gate, so a host
 * approving their own read is no wider than what the library's own create
 * form already allows; the library detail screen's status control still
 * retires it. Shared by createLiveReadItem's "keep in library" checkbox and
 * saveLiveReadToLibrary's after-the-fact conversion.
 */
async function insertLibraryItemFromLiveRead(
  supabase: SupabaseServerClient,
  path: string,
  input: {
    title: string;
    script: string | null;
    durationSeconds: number;
    contentType: LogContentType;
    profileId: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("log_content_items")
    .insert({
      content_type: input.contentType,
      title: input.title,
      script: input.script,
      expected_duration_seconds: input.durationSeconds,
      approval_status: "approved",
      owner_id: input.profileId,
      created_by: input.profileId,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not save this item to the library");
  if (!data) failWith(path, "Could not save this item to the library.");
  return data.id;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Renumbers a break's items into exactly the given order (1..N) — shared by
 * lib/log/rundown-relocation.ts's relocateItem (a drag) and placeNewItemAtPosition below (a fresh
 * insert), since both are "this break's items should now read in this
 * order" once whatever changed has changed. Position is just a sort key;
 * nothing depends on it staying contiguous outside this one write.
 */
async function renumberBreakItems(
  supabase: SupabaseServerClient,
  orderedItemIds: string[],
): Promise<string | null> {
  const results = await Promise.all(
    orderedItemIds.map((id, index) =>
      supabase
        .from("log_rundown_items")
        .update({ position: index + 1 })
        .eq("id", id),
    ),
  );
  return results.find((result) => result.error) ? "Could not reorder this break's items." : null;
}

/**
 * Moves a just-inserted item (which landed at the end of its break, per
 * every insert path's own nextPosition = max+1) into place ahead of
 * beforeItemId — the server half of the breaks board's insertion-point
 * affordance (rundown-breaks-board.tsx / insertion-point.tsx): a host can
 * insert new content between two existing items, not just append it.
 * Renumbering the whole break rather than fractional positions — this
 * repo's position columns are plain integers, and a drag reorder already
 * renumbers the same way (see lib/log/rundown-relocation.ts), so this reuses that
 * approach rather than introducing a second one.
 */
async function placeNewItemAtPosition(
  supabase: SupabaseServerClient,
  breakId: string,
  beforeItemId: string,
  newItemId: string,
): Promise<string | null> {
  if (beforeItemId === "") return null;

  const { data: items, error } = await supabase
    .from("log_rundown_items")
    .select("id")
    .eq("break_id", breakId)
    .order("position");
  if (error || !items) return "Could not place this item.";

  const withoutNew = items.map((item) => item.id).filter((id) => id !== newItemId);
  const insertAt = withoutNew.indexOf(beforeItemId);
  const finalOrder = [...withoutNew];
  finalOrder.splice(insertAt === -1 ? finalOrder.length : insertAt, 0, newItemId);

  return renumberBreakItems(supabase, finalOrder);
}

/** The parts of a schedule entry a rundown is built from. */
type GenerationEntry = Pick<
  LogScheduleRow,
  "id" | "program_id" | "clock_template_id" | "air_time" | "duration_minutes"
>;

type GenerateResult =
  { ok: true; rundownId: string; created: boolean } | { ok: false; error: string };

/**
 * Creates the rundown for a schedule entry's program on an air date, or
 * returns the live (not superseded) one that already exists. Every local
 * opportunity gets a break (including optional ones, which render as
 * "carrying network" until something is placed) — see
 * lib/log/rundown-generation.ts. Returns a result instead of redirecting so
 * both generateRundown (one date, one click) and switchProgramRundowns (many
 * dates) can report what happened.
 */
async function generateRundownForEntry(
  scheduleEntry: GenerationEntry,
  airDate: string,
): Promise<GenerateResult> {
  const existing = await getRundownForProgramOnDate(scheduleEntry.program_id, airDate);
  if (existing) return { ok: true, rundownId: existing.id, created: false };

  const template = await getClockTemplateDetail(scheduleEntry.clock_template_id);
  const version = template ? resolveCurrentVersion(template.versions, airDate) : null;
  if (!version) {
    return { ok: false, error: "This program's clock has no version in effect on that date." };
  }

  const opportunities = (await listLocalOpportunitiesForVersion(version.id)).map(
    toRundownOpportunity,
  );

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
  if (rundownError || !rundown) {
    console.error("Could not generate the rundown:", rundownError);
    return {
      ok: false,
      error: `Could not generate the rundown: ${rundownError?.message ?? "no row was returned"}`,
    };
  }

  const drafts = buildRundownBreakDrafts(
    opportunities,
    shiftStartAt,
    scheduleEntry.duration_minutes,
  );
  if (drafts.length > 0) {
    // upsert + ignoreDuplicates on the break's (clock_slot_id, hour_index)
    // key — not just a plain insert — so a duplicate is impossible at the
    // database level even under a concurrent double-submit. Times come from
    // the slot (log_derive_rundown_break_times); see breakInsertRow.
    const { data: insertedBreaks, error: breaksError } = await supabase
      .from("log_rundown_breaks")
      .upsert(
        drafts.map((draft) => breakInsertRow(draft, rundown.id)),
        { onConflict: BREAK_OCCURRENCE_CONFLICT, ignoreDuplicates: true },
      )
      .select("id, local_opportunity_id, scheduled_at");
    if (breaksError) {
      console.error("Rundown created, but its breaks could not be generated:", breaksError);
      return {
        ok: false,
        error: `Rundown created, but its local-opportunity breaks could not be generated: ${breaksError.message}`,
      };
    }
    await placeAssignedContent(supabase, insertedBreaks ?? [], drafts, airDate);
  }

  return { ok: true, rundownId: rundown.id, created: true };
}

/**
 * Generates (or, if one already exists, just links to) the rundown for a
 * program on a given air date — docs/log-design.md Workflow E. Idempotent:
 * log_rundowns' partial unique index over (program_id, air_date) where not
 * superseded backs this up at the database level too.
 */
export async function generateRundown(formData: FormData): Promise<void> {
  await assertLogAccess();
  const scheduleEntryId = field(formData, "schedule_entry_id");
  const airDate = field(formData, "air_date");
  if (scheduleEntryId === "" || airDate === "")
    failWith("/log", "Choose a program to generate a rundown for.");

  const postedEntry = await getScheduleEntry(scheduleEntryId);
  if (!postedEntry) failWith("/log", "That schedule entry no longer exists.");

  // Whatever row the click came from, the rundown is built from the entry in
  // force for that program on that date — a one-time change replaces the
  // recurring entry, so a stale Generate button can't build the wrong clock.
  const scheduleEntry = resolveEntryInForce(
    await listScheduleEntriesForProgram(postedEntry.program_id),
    airDate,
  );
  if (!scheduleEntry) failWith("/log", "This program has no schedule entry in force on that date.");

  const result = await generateRundownForEntry(scheduleEntry, airDate);
  if (!result.ok) failWith("/log", result.error);

  revalidatePath("/log");
  redirect(rundownPath(result.rundownId));
}

/**
 * Brings a program's upcoming rundowns in line with its schedule after a
 * one-time change (FPREN Phase I storm coverage, say) was added, shortened or
 * removed. Each rundown that is still ungenerated-for-air and no longer
 * matches the entry in force (lib/log/clock-sync.ts) is superseded —
 * log_supersede_rundown keeps it, records its placed underwriting credits as
 * missed (special_coverage) so Traffic reviews them, and refuses one that has
 * started or has events — and a replacement is generated on the right clock.
 * Imported and generated rundowns are treated alike. The result also reports
 * credits Traffic never placed and DAD logs already released for those dates.
 * Program director only; the database function enforces it too.
 */
export async function switchProgramRundowns(formData: FormData): Promise<void> {
  await assertProgramDirector();
  const programId = field(formData, "program_id");
  if (programId === "") failWith("/log/programs", "Choose a program.");
  const path = `/log/programs/${programId}`;

  const today = stationTodayISO();
  const [entries, rundowns] = await Promise.all([
    listScheduleEntriesForProgram(programId),
    listUpcomingRundownsWithClock(programId, today),
  ]);
  const outOfStep = findOutOfStepRundowns(rundowns, entries, new Date().toISOString());
  if (outOfStep.length === 0) {
    redirect(`${path}?switched=0`);
  }

  const supabase = await createClient();
  let switched = 0;
  let credits = 0;
  let unplaced = 0;
  const releasedDates = new Set<string>();
  const problems: string[] = [];
  for (const item of outOfStep) {
    // Credits with no Traffic placement behind them (an imported log's) can't
    // raise an exception — there is no contract line to be owed — so count
    // them before the swap and report them instead of dropping them silently.
    const { count: creditItems } = await supabase
      .from("log_rundown_items")
      .select("id, log_rundown_breaks!inner(rundown_id)", { count: "exact", head: true })
      .eq("item_kind", "underwriting_credit")
      .eq("log_rundown_breaks.rundown_id", item.rundown.id);
    const { data, error } = await supabase.rpc("log_supersede_rundown", {
      p_rundown_id: item.rundown.id,
      p_note: `Schedule entry in force: ${item.entry.id}.`,
    });
    if (error || !data || "error" in data) {
      const reason = error?.message ?? (data && "error" in data ? data.error : "no result");
      problems.push(`${item.rundown.air_date}: ${reason}`);
      continue;
    }
    credits += data.credits_recorded;
    unplaced += Math.max(0, (creditItems ?? 0) - data.credits_recorded);

    // The DAD log for the day (or the next, for an overnight shift) may have
    // been released with the old rundown's breaks in it.
    const { data: released, error: releasedError } = await supabase
      .from("log_dad_exports")
      .select("air_date")
      .in("air_date", [item.rundown.air_date, shiftDateISO(item.rundown.air_date, 1)]);
    if (releasedError) {
      problems.push(
        `${item.rundown.air_date}: could not check for a released DAD log (${releasedError.message}) — check the DAD log screen.`,
      );
    }
    for (const row of released ?? []) releasedDates.add(row.air_date);

    const generated = await generateRundownForEntry(item.entry, item.rundown.air_date);
    if (!generated.ok) {
      problems.push(
        `${item.rundown.air_date}: the old rundown was retired but the new one was not built (${generated.error}) — generate it from Today.`,
      );
      continue;
    }
    switched += 1;
  }

  revalidatePath("/log");
  revalidatePath(path);
  const query = new URLSearchParams({ switched: String(switched), credits: String(credits) });
  if (unplaced > 0) query.set("unplaced", String(unplaced));
  if (releasedDates.size > 0) query.set("dad", [...releasedDates].sort().join(","));
  if (problems.length > 0) query.set("error", problems.join(" · "));
  redirect(`${path}?${query.toString()}`);
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
  if (rundown.superseded_at) {
    failWith(path, "This rundown was replaced by one on another clock, so it isn't synced.");
  }

  const opportunities = (await listLocalOpportunitiesForVersion(rundown.clock_version_id)).map(
    toRundownOpportunity,
  );
  const shiftDurationMinutes = Math.round(
    (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) /
      60_000,
  );
  const drafts = buildRundownBreakDrafts(
    opportunities,
    rundown.shift_start_at,
    shiftDurationMinutes,
  );
  // A break is one occurrence of one slot, so "missing" is a plain key
  // difference — the same for generated and imported rundowns. A slot an
  // import already placed something in is present, marked or not.
  const missing = selectMissingBreakDrafts(drafts, rundown.breaks);

  if (missing.length > 0) {
    const supabase = await createClient();
    // Same upsert + ignoreDuplicates guard as generateRundown — belt and
    // braces alongside selectMissingBreakDrafts' own check, since two
    // concurrent clicks of "Sync them in now" could otherwise both compute
    // the same "missing" set before either write lands.
    const { data: insertedBreaks, error } = await supabase
      .from("log_rundown_breaks")
      .upsert(
        missing.map((draft) => breakInsertRow(draft, rundown.id)),
        { onConflict: BREAK_OCCURRENCE_CONFLICT, ignoreDuplicates: true },
      )
      .select("id, local_opportunity_id, scheduled_at");
    failIfError(error, path, "Could not sync this rundown's breaks");
    await placeAssignedContent(supabase, insertedBreaks ?? [], drafts, rundown.air_date);
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
  const beforeItemId = field(formData, "before_item_id");
  const path = rundownPath(rundownId);
  if (contentItemId === "") failWith(path, "Choose something to add.");

  const supabase = await createClient();

  if (contentItemId === WEATHER_ITEM_SENTINEL) {
    const { data: existingItems, error: countError } = await supabase
      .from("log_rundown_items")
      .select("position")
      .eq("break_id", breakId);
    failIfError(countError, path, "Could not add weather");
    const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

    const { data: inserted, error } = await supabase
      .from("log_rundown_items")
      .insert({
        break_id: breakId,
        position: nextPosition,
        item_kind: "weather",
        planned_duration_seconds: WEATHER_DEFAULT_DURATION_SECONDS,
        placement_status: "editable",
      })
      .select("id")
      .single();
    failIfError(error, path, "Could not add weather");

    if (inserted) {
      const placeError = await placeNewItemAtPosition(supabase, breakId, beforeItemId, inserted.id);
      if (placeError) failWith(path, placeError);
    }

    revalidatePath(path);
    redirect(path);
  }

  const result = await invokeCapability(buildRundownItem, { breakId, contentItemId });
  if (!result.ok) failWith(path, result.error);

  const placeError = await placeNewItemAtPosition(supabase, breakId, beforeItemId, result.itemId);
  if (placeError) failWith(path, placeError);

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
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const breakId = field(formData, "break_id");
  const title = field(formData, "title");
  const script = field(formData, "script");
  // Blank duration: the script's read-time estimate (live-read-form.tsx
  // shows it as the field's placeholder).
  const typedDurationSeconds = Number.parseInt(field(formData, "duration_seconds"), 10);
  const durationSeconds = Number.isFinite(typedDurationSeconds)
    ? typedDurationSeconds
    : (estimateReadSeconds(script) ?? Number.NaN);
  const sourceNprItemId = field(formData, "source_npr_item_id");
  const sourceNprItemTitle = field(formData, "source_npr_item_title");
  const beforeItemId = field(formData, "before_item_id");
  const path = rundownPath(rundownId);
  // "Keep in library" (live-read-form.tsx): the read is written to the
  // library first and placed as an ordinary content item pointing at it,
  // rather than as a live_read that would vanish with this rundown — the
  // same end state saveLiveReadToLibrary reaches after the fact. Never for
  // an NPR look-ahead: a story teaser is dated by nature and would only
  // accumulate stale entries in the library (the form hides the checkbox
  // once a look-ahead is picked; this is the server-side half of that).
  const keepInLibrary = field(formData, "keep_in_library") === "on";
  if (title === "") failWith(path, "Give this live-read item a short title.");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0)
    failWith(path, "Enter a duration in seconds, or a script to estimate it from.");
  if (keepInLibrary && sourceNprItemId !== "")
    failWith(
      path,
      "An NPR look-ahead is tied to today's episode and can't be kept in the library.",
    );
  const libraryContentType = keepInLibrary ? libraryContentTypeFromForm(formData, path) : null;

  const supabase = await createClient();
  const { data: existingItems, error: countError } = await supabase
    .from("log_rundown_items")
    .select("position")
    .eq("break_id", breakId);
  failIfError(countError, path, "Could not add this item");
  const nextPosition = Math.max(0, ...(existingItems ?? []).map((item) => item.position)) + 1;

  const contentItemId = libraryContentType
    ? await insertLibraryItemFromLiveRead(supabase, path, {
        title,
        script: script || null,
        durationSeconds,
        contentType: libraryContentType,
        profileId: profile.id,
      })
    : null;

  const { data: inserted, error } = await supabase
    .from("log_rundown_items")
    .insert(
      contentItemId
        ? {
            break_id: breakId,
            position: nextPosition,
            item_kind: "content",
            content_item_id: contentItemId,
            planned_duration_seconds: durationSeconds,
            placement_status: "editable",
          }
        : {
            break_id: breakId,
            position: nextPosition,
            item_kind: "live_read",
            live_read_title: title,
            live_read_script: script || null,
            planned_duration_seconds: durationSeconds,
            placement_status: "editable",
            source_npr_item_id: sourceNprItemId || null,
            source_npr_item_title: sourceNprItemTitle || null,
          },
    )
    .select("id")
    .single();
  failIfError(error, path, "Could not add this item");

  if (inserted) {
    const placeError = await placeNewItemAtPosition(supabase, breakId, beforeItemId, inserted.id);
    if (placeError) failWith(path, placeError);
  }

  revalidatePath(path);
  redirect(path);
}

/**
 * Keeps a one-off live read beyond today: writes it to the library as a new
 * approved content item and converts this rundown item in place to an
 * ordinary content item pointing at it (item_kind live_read → content,
 * the inline title/script nulled, as the item-kind shape constraint
 * requires). Converting rather than copying is deliberate — the item id is
 * what log_broadcast_events references, so an airing already marked aired
 * counts as the new library item's history from day one instead of forking
 * the same read into two unrelated things. The live read's script becomes
 * the library item's master script, so nothing about how this card renders
 * changes; the host's only visible difference is that the read is now
 * offered in every eligible break's picker tomorrow. Refused for an NPR
 * look-ahead for the reason createLiveReadItem's own comment gives.
 */
export async function saveLiveReadToLibrary(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);
  const contentType = libraryContentTypeFromForm(formData, path);

  const item = await getRundownItem(itemId);
  if (!item) failWith(path, "That item no longer exists.");
  if (item.item_kind !== "live_read" || item.live_read_title === null)
    failWith(path, "Only a one-off live read can be saved to the library.");
  if (item.source_npr_item_id !== null)
    failWith(
      path,
      "An NPR look-ahead is tied to today's episode and can't be kept in the library.",
    );

  const supabase = await createClient();
  const contentItemId = await insertLibraryItemFromLiveRead(supabase, path, {
    title: item.live_read_title,
    script: item.live_read_script,
    durationSeconds: item.planned_duration_seconds,
    contentType,
    profileId: profile.id,
  });

  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      item_kind: "content",
      content_item_id: contentItemId,
      live_read_title: null,
      live_read_script: null,
    })
    .eq("id", itemId)
    .eq("item_kind", "live_read");
  failIfError(error, path, "Saved to the library, but could not relink this item to it");

  revalidatePath(path);
  revalidatePath("/log/library");
  redirect(path);
}

/**
 * The mirror image of saveLiveReadToLibrary for a library item a host has
 * edited for this airing (updateItemOverrides): when the per-airing wording
 * turns out to be the new correct wording, write it back to the master
 * log_content_items row and clear the override, so tomorrow's placement
 * carries it without anyone re-keying it in the library. Only the two
 * fields the card's edit form exposes are written back — override_script
 * onto script, and override_duration_seconds onto expected_duration_seconds.
 * The duration is written back only for an item with no components:
 * computeTotalDurationSeconds ignores expected_duration_seconds once
 * components exist (their required durations are the total), so writing it
 * there would silently change nothing; for such an item the duration
 * override is left in place on this airing and only the script is applied.
 * planned_duration_seconds is recomputed the same way updateItemOverrides
 * does, from whatever overrides remain.
 */
export async function applyOverridesToLibraryItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

  const item = await getRundownItem(itemId);
  if (!item) failWith(path, "That item no longer exists.");
  if (item.item_kind !== "content" || item.content_item_id === null)
    failWith(path, "Only a library item's edits can be applied back to the library.");
  if (item.override_script === null && item.override_duration_seconds === null)
    failWith(path, "This item has no script or duration edit to apply.");

  const contentItem = await getContentItemDetail(item.content_item_id);
  if (!contentItem) failWith(path, "That library item no longer exists.");
  const applyDuration =
    item.override_duration_seconds !== null && contentItem.components.length === 0;

  const supabase = await createClient();
  const { error: masterError } = await supabase
    .from("log_content_items")
    .update({
      ...(item.override_script !== null ? { script: item.override_script } : {}),
      ...(applyDuration ? { expected_duration_seconds: item.override_duration_seconds } : {}),
    })
    .eq("id", contentItem.id);
  failIfError(masterError, path, "Could not update the library item");

  const remainingDurationOverride = applyDuration ? null : item.override_duration_seconds;
  const plannedDurationSeconds =
    computeEffectiveDurationSeconds(
      contentItem.components,
      applyDuration ? item.override_duration_seconds : contentItem.expected_duration_seconds,
      {
        override_duration_seconds: remainingDurationOverride,
        override_live_intro_seconds: item.override_live_intro_seconds,
        override_live_outro_seconds: item.override_live_outro_seconds,
        override_tag_seconds: item.override_tag_seconds,
      },
    ) ?? item.planned_duration_seconds;

  const { error } = await supabase
    .from("log_rundown_items")
    .update({
      override_script: null,
      override_duration_seconds: remainingDurationOverride,
      planned_duration_seconds: plannedDurationSeconds,
    })
    .eq("id", itemId);
  failIfError(error, path, "Updated the library item, but could not clear this airing's edit");

  revalidatePath(path);
  revalidatePath(`/log/library/${contentItem.id}`);
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
  const item = await getRundownItem(itemId);
  if (!item) failWith(path, "That item no longer exists.");

  if (item.item_kind === "underwriting_credit") {
    // A placement-less credit (created by the program-log import) is
    // removable by any host; log_delete_unplaced_credit_item() refuses a
    // placement-backed one, which only log_clear_underwriting_credit()
    // (Underwriting's own path) may remove — the check lives in the
    // security-definer function, not here.
    const { data, error } = await supabase.rpc("log_delete_unplaced_credit_item", {
      p_item_id: itemId,
    });
    failIfError(error, path, "Could not remove this credit");
    if (data && typeof data === "object" && "error" in data) failWith(path, data.error);
  } else {
    await deleteOrFail(
      supabase
        .from("log_rundown_items")
        .delete()
        .eq("id", itemId)
        .neq("item_kind", "underwriting_credit")
        .select("id"),
      path,
      "Could not remove this item",
    );
  }

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

  const overrideScript = field(formData, "override_script");
  const overrideNotes = field(formData, "override_notes");
  const overrideDurationSeconds = optionalInt(formData, "override_duration_seconds");
  const overrideLiveIntroSeconds = optionalInt(formData, "override_live_intro_seconds");
  const overrideLiveOutroSeconds = optionalInt(formData, "override_live_outro_seconds");
  const overrideTagSeconds = optionalInt(formData, "override_tag_seconds");

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase
    .from("log_rundown_items")
    .select("content_item_id, underwriting_copy_id")
    .eq("id", itemId)
    .single();
  failIfError(itemError, path, "Could not update this item");

  let plannedDurationSeconds: number | null = overrideDurationSeconds;
  // A credit with its duration override cleared goes back to the copy's
  // read-time estimate — the same default the import planned it at.
  if (plannedDurationSeconds === null && item?.underwriting_copy_id) {
    const { data: copy, error: copyError } = await supabase
      .from("uw_copy")
      .select("script")
      .eq("id", item.underwriting_copy_id)
      .maybeSingle();
    failIfError(copyError, path, "Could not update this item");
    plannedDurationSeconds = estimateReadSeconds(copy?.script);
  }
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

// Relocating an item (drag-and-drop, or "Move to…") moved to
// lib/log/rundown-relocation.ts, reached through broadcast-actions.ts's
// syncBroadcastAction: it is one of the live screen's offline-queued
// actions now, not an action the board calls directly.
