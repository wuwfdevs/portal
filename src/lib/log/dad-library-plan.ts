// Pure planner for importing WUWF's existing DAD cut library
// (dad-library-import.ts's parser output) into the content library. Given
// parsed cuts plus the database's current state (programs, schedule
// entries, already-imported items — all supplied by the caller, this module
// never touches Supabase), produces an explicit plan the preview screen
// renders verbatim and the executor applies — the same "one computation
// drives both" discipline program-log-plan.ts follows.
//
// Per-group routing was worked out with WUWF directly, cut by cut, rather
// than guessed from the group names alone:
//  - UNEARTH, ECO: WUWF's own produced features -> interview_feature.
//  - CARS, EVENTS: station promotional spots -> station_promo.
//  - FALL, SPRING: pledge-drive spots -> membership_message.
//  - PPA: audio spots (prospecting/informational), not routed through
//    Underwriting & Traffic's own copy tables -> psa.
//  - NPRTHEME: imported as-is, one item per cut -> program_promo.
//  - GENERIC, DAILY, WEEKLY: these hold per-date/numbered program promos,
//    not durable content on their own. Cuts whose title matches a real Log
//    program are collapsed into one evergreen program_promo item per
//    program (see buildSynthesizedPromo); anything that doesn't match a
//    program (generic station messaging like "Smart Speaker", or a name
//    with no Log program at all, like "Thistle") still gets imported, just
//    as an ordinary one-per-cut station_promo rather than folded into a
//    canonical promo.
//  - FLNEWS, TEMP, TEST, SONGS, ACOUSTIC: not durable/reusable content
//    (dated news actualities, scratch files, test tones, music/filler) ->
//    skipped entirely.
// A group this table has never seen is skipped too, with a warning, rather
// than silently guessed at or silently dropped.

import type { LogContentType } from "@/lib/database.types";
import { formatAirTime } from "@/lib/log/schedule";
import { matchProgram, type PlanProgram } from "@/lib/log/program-log-plan";
import type { DadGroup, DadLibraryCut } from "@/lib/log/dad-library-import";

const DIRECT_CONTENT_TYPE_BY_GROUP: Record<string, LogContentType> = {
  UNEARTH: "interview_feature",
  ECO: "interview_feature",
  CARS: "station_promo",
  EVENTS: "station_promo",
  FALL: "membership_message",
  SPRING: "membership_message",
  PPA: "psa",
  NPRTHEME: "program_promo",
};

const COLLAPSE_GROUPS = new Set(["GENERIC", "DAILY", "WEEKLY"]);
const SKIP_GROUPS = new Set(["FLNEWS", "TEMP", "TEST", "SONGS", "ACOUSTIC"]);

/**
 * Abbreviations DAD's own titles use that don't contain the real Log
 * program name as a substring (program-log-plan.ts's matchProgram already
 * handles the ordinary case — a title containing the program's full name).
 * Checked as a normalized-string *prefix*, in order, only when matchProgram
 * itself found nothing. Deliberately curated, not inferred: a wrong guess
 * here creates a canonical promo attributed to the wrong program.
 */
const ABBREVIATION_PREFIXES: { prefix: string; programName: string }[] = [
  { prefix: "1a", programName: "1A" },
  { prefix: "wesat", programName: "Weekend Edition Saturday" },
  { prefix: "atc", programName: "All Things Considered" },
  { prefix: "wait", programName: "Wait Wait... Don't Tell Me!" },
  { prefix: "scifri", programName: "Science Friday" },
  { prefix: "morned", programName: "Morning Edition" },
  { prefix: "cafe", programName: "World Cafe" },
  { prefix: "marktplace", programName: "Marketplace" },
  { prefix: "mtstage", programName: "Mountain Stage" },
  { prefix: "selectshorts", programName: "Selected Shorts" },
  { prefix: "livingearth", programName: "Living on Earth" },
  { prefix: "americanlife", programName: "This American Life" },
  { prefix: "flfrontiers", programName: "Florida Frontiers" },
  { prefix: "amroutes", programName: "American Routes" },
  { prefix: "bbc", programName: "BBC World" },
  { prefix: "otm", programName: "On the Media" },
  { prefix: "capreport", programName: "Capital Report" },
  { prefix: "flroundup", programName: "The Florida Roundup" },
  { prefix: "stevestravels", programName: "Travel with Rick Steves" },
  { prefix: "putumayo", programName: "Putumayo World Music Hour" },
  { prefix: "jazznight", programName: "Jazz Night in America" },
  { prefix: "bigbands", programName: "Big Bands & Jazz" },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** matchProgram's ordinary containment check, then a curated abbreviation fallback. */
export function matchProgramForPromo(title: string, programs: PlanProgram[]): PlanProgram | null {
  const direct = matchProgram(title, programs);
  if (direct) return direct;
  const normalized = normalize(title);
  for (const { prefix, programName } of ABBREVIATION_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      const program = programs.find((candidate) => candidate.name === programName);
      if (program) return program;
    }
  }
  return null;
}

export interface PlanScheduleEntry {
  program_id: string;
  entry_type: string;
  days_of_week: number[];
  /** "19:00:00" */
  air_time: string;
}

export interface PlanExistingItem {
  id: string;
  dad_cart_number: string | null;
}

export interface DadLibraryPlanInputs {
  cuts: DadLibraryCut[];
  groups: DadGroup[];
  programs: PlanProgram[];
  scheduleEntries: PlanScheduleEntry[];
  existingItems: PlanExistingItem[];
}

export interface DirectItemPlan {
  cutNumber: string;
  title: string;
  lengthSeconds: number;
  group: string;
  contentType: LogContentType;
  /** An existing log_content_items row already carrying this cart number — updated in place, not duplicated. */
  existingItemId: string | null;
  /** True for a GENERIC/DAILY/WEEKLY cut that matched no Log program — imported plainly rather than synthesized. */
  unmatchedProgramPromo: boolean;
}

export interface SynthesizedPromoPlan {
  programId: string;
  programName: string;
  /** Distinct source groups feeding this program's canonical promo, joined for display/storage (e.g. "DAILY, GENERIC"). */
  dadGroup: string;
  representativeCutNumber: string;
  recordedAudioDurationSeconds: number;
  tagScript: string;
  tagDurationSeconds: number;
  expectedDurationSeconds: number;
  sourceCutCount: number;
  existingItemId: string | null;
}

export interface GroupSummary {
  group: string;
  cutCount: number;
  treatment: "direct" | "collapse" | "skip" | "unknown";
  contentType: LogContentType | null;
}

export interface DadLibraryPlan {
  groupSummaries: GroupSummary[];
  directItems: DirectItemPlan[];
  synthesizedPromos: SynthesizedPromoPlan[];
  warnings: string[];
}

export const DEFAULT_TAG_SECONDS = 8;

/**
 * A synthesized promo's own expected_duration_seconds — a flat default. The
 * content library list/detail screens read this column directly rather than
 * computing a total from components, so leaving it unset showed as a blank
 * duration for every canonical promo. The tag read isn't additional time on
 * top of this: per station practice, every one of these promos carries a
 * trailing music bed and the host reads the tag live over it, not after it —
 * see the (non-required) live_outro component this plan produces.
 */
export const PROMO_EXPECTED_DURATION_SECONDS = 30;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeBucket(airTime: string, plural: boolean): string {
  const hour = Number.parseInt(airTime.split(":")[0] ?? "0", 10);
  if (hour >= 5 && hour < 12) return plural ? "mornings" : "morning";
  if (hour >= 12 && hour < 17) return plural ? "afternoons" : "afternoon";
  if (hour >= 17 && hour < 21) return plural ? "evenings" : "evening";
  return plural ? "nights" : "night";
}

/**
 * A host-read "tune in" phrase derived from a program's own schedule entry —
 * e.g. "weekday evenings at 7:00 PM" or "Fridays afternoon at 1:00 PM".
 * Static text, not a live template: it reflects the schedule at the moment
 * of import and is ordinary editable content afterward, same as any other
 * content item's script.
 */
export function describeScheduleTiming(entry: PlanScheduleEntry): string {
  const time = formatAirTime(entry.air_time);
  const days = [...new Set(entry.days_of_week)].sort();
  if (days.length === 1) {
    return `${DAY_NAMES[days[0]!]} ${timeBucket(entry.air_time, false)} at ${time}`;
  }
  const isWeekdays = days.length === 5 && days.every((day) => day >= 1 && day <= 5);
  const isWeekends = days.length === 2 && days.includes(0) && days.includes(6);
  const isEveryDay = days.length === 7;
  const dayPhrase = isEveryDay ? "every day" : isWeekdays ? "weekday" : isWeekends ? "weekend" : "";
  if (isEveryDay) return `${dayPhrase} ${timeBucket(entry.air_time, false)} at ${time}`;
  if (dayPhrase !== "") return `${dayPhrase} ${timeBucket(entry.air_time, true)} at ${time}`;
  const names = days.map((day) => DAY_NAMES[day]).join(", ");
  return `${names} at ${time}`;
}

function pickPrimaryScheduleEntry(programId: string, entries: PlanScheduleEntry[]): PlanScheduleEntry | null {
  const candidates = entries.filter((entry) => entry.program_id === programId);
  if (candidates.length === 0) return null;
  // Prefer the entry covering the most days (the "usual" airing) so a
  // one-off exception (World Cafe's shorter Thursday, per its schedule note)
  // doesn't become the phrase every listener sees.
  return [...candidates].sort((a, b) => b.days_of_week.length - a.days_of_week.length)[0]!;
}

export function buildDadLibraryPlan(inputs: DadLibraryPlanInputs): DadLibraryPlan {
  const warnings: string[] = [];
  const existingByCart = new Map(
    inputs.existingItems.filter((item) => item.dad_cart_number !== null).map((item) => [item.dad_cart_number!, item.id]),
  );

  const cutsByGroup = new Map<string, DadLibraryCut[]>();
  for (const cut of inputs.cuts) {
    const list = cutsByGroup.get(cut.group);
    if (list) list.push(cut);
    else cutsByGroup.set(cut.group, [cut]);
  }

  const groupSummaries: GroupSummary[] = [];
  const directItems: DirectItemPlan[] = [];
  const promosByProgram = new Map<
    string,
    { program: PlanProgram; cuts: DadLibraryCut[]; groups: Set<string> }
  >();

  for (const [group, cuts] of [...cutsByGroup.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (SKIP_GROUPS.has(group)) {
      groupSummaries.push({ group, cutCount: cuts.length, treatment: "skip", contentType: null });
      continue;
    }

    const directType = DIRECT_CONTENT_TYPE_BY_GROUP[group];
    if (directType) {
      groupSummaries.push({ group, cutCount: cuts.length, treatment: "direct", contentType: directType });
      for (const cut of cuts) {
        directItems.push({
          cutNumber: cut.cutNumber,
          title: cut.title,
          lengthSeconds: cut.lengthSeconds,
          group: cut.group,
          contentType: directType,
          existingItemId: existingByCart.get(cut.cutNumber) ?? null,
          unmatchedProgramPromo: false,
        });
      }
      continue;
    }

    if (COLLAPSE_GROUPS.has(group)) {
      groupSummaries.push({ group, cutCount: cuts.length, treatment: "collapse", contentType: "program_promo" });
      for (const cut of cuts) {
        const program = matchProgramForPromo(cut.title, inputs.programs);
        if (!program) {
          directItems.push({
            cutNumber: cut.cutNumber,
            title: cut.title,
            lengthSeconds: cut.lengthSeconds,
            group: cut.group,
            contentType: "station_promo",
            existingItemId: existingByCart.get(cut.cutNumber) ?? null,
            unmatchedProgramPromo: true,
          });
          continue;
        }
        const existing = promosByProgram.get(program.id);
        if (existing) {
          existing.cuts.push(cut);
          existing.groups.add(group);
        } else {
          promosByProgram.set(program.id, { program, cuts: [cut], groups: new Set([group]) });
        }
      }
      continue;
    }

    groupSummaries.push({ group, cutCount: cuts.length, treatment: "unknown", contentType: null });
    warnings.push(
      `Unrecognized DAD group "${group}" (${cuts.length} cut${cuts.length === 1 ? "" : "s"}) — not in the importer's routing table, so it was skipped.`,
    );
  }

  const synthesizedPromos: SynthesizedPromoPlan[] = [];
  for (const { program, cuts, groups } of promosByProgram.values()) {
    const representative = [...cuts].sort((a, b) => a.cutNumber.localeCompare(b.cutNumber))[0]!;
    const scheduleEntry = pickPrimaryScheduleEntry(program.id, inputs.scheduleEntries);
    const tagScript = scheduleEntry
      ? `Join us for ${program.name}, ${describeScheduleTiming(scheduleEntry)}.`
      : `Join us for ${program.name}.`;
    if (!scheduleEntry) {
      warnings.push(`${program.name} has no Log schedule entry, so its canonical promo has no air-time tag.`);
    }
    synthesizedPromos.push({
      programId: program.id,
      programName: program.name,
      dadGroup: [...groups].sort().join(", "),
      representativeCutNumber: representative.cutNumber,
      recordedAudioDurationSeconds: representative.lengthSeconds,
      tagScript,
      tagDurationSeconds: DEFAULT_TAG_SECONDS,
      expectedDurationSeconds: PROMO_EXPECTED_DURATION_SECONDS,
      sourceCutCount: cuts.length,
      existingItemId: existingByCart.get(representative.cutNumber) ?? null,
    });
  }
  synthesizedPromos.sort((a, b) => a.programName.localeCompare(b.programName));

  return { groupSummaries, directItems, synthesizedPromos, warnings };
}
