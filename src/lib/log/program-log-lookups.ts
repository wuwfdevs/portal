// The program-log importer's lookup tools — pure, no Supabase, colocated
// test. Rather than stuffing the schedule, the copy library, and ~900
// content-library titles into every import's context, the model asks for
// exactly what the document mentions: which programs air on the log's
// date, which copy an underwriter already has, which library item a fill
// is. Each handler is a lookup over lists the Server Action preloaded
// (import-actions.ts), returning ids the model then copies into its final
// plan (program-log-plan.ts resolves them). The model chooses the query
// and makes the pick; nothing here decides what the document says.

import type OpenAI from "openai";
import { isScheduleEntryActiveOn } from "@/lib/log/schedule";
import type {
  PlanContentItem,
  PlanCopy,
  PlanScheduleEntry,
  PlanUnderwriter,
} from "@/lib/log/program-log-plan";

export interface ImportLookupData {
  scheduleEntries: PlanScheduleEntry[];
  underwriters: PlanUnderwriter[];
  copy: PlanCopy[];
  contentItems: PlanContentItem[];
}

export const SCHEDULE_TOOL = "schedule_for_date";
export const COPY_TOOL = "list_copy_for_underwriter";
export const CONTENT_TOOL = "search_content_items";

const MAX_CONTENT_MATCHES = 8;
const SCRIPT_OPENING_WORDS = 12;

export function buildImportTools(): OpenAI.Responses.FunctionTool[] {
  return [
    {
      type: "function",
      name: SCHEDULE_TOOL,
      description:
        "The programs scheduled to air on a given date, with the schedule_entry_id each rundown must reference. Call once, with the log's own date, before building rundowns.",
      strict: true,
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD" } },
        required: ["date"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: COPY_TOOL,
      description:
        "The underwriting copy already on file for one underwriter (copy_id, label, cart, opening words of the script). Call for each underwriter whose credit appears in the log, to decide whether a credit is an existing message or new copy.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          underwriter: { type: "string", description: "An underwriter name exactly as listed." },
        },
        required: ["underwriter"],
        additionalProperties: false,
      },
    },
    {
      type: "function",
      name: CONTENT_TOOL,
      description:
        "Search the content library by title for a non-credit fill (a promo, feature, or ID). Returns candidate content_item_ids; pick one only if it is clearly the same piece, otherwise keep the fill as a live_read.",
      strict: true,
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The fill's printed description." } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  ];
}

/** Executes one tool call. Returns the JSON text the model reads back. */
export function runImportLookup(
  name: string,
  rawArguments: string,
  data: ImportLookupData,
): string {
  const args = parseArguments(rawArguments);
  switch (name) {
    case SCHEDULE_TOOL:
      return JSON.stringify(scheduleForDate(String(args.date ?? ""), data.scheduleEntries));
    case COPY_TOOL:
      return JSON.stringify(copyForUnderwriter(String(args.underwriter ?? ""), data));
    case CONTENT_TOOL:
      return JSON.stringify(searchContentItems(String(args.query ?? ""), data.contentItems));
    default:
      return JSON.stringify({ error: `Unknown tool "${name}".` });
  }
}

export function scheduleForDate(date: string, entries: PlanScheduleEntry[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { entries: [], note: "date must be YYYY-MM-DD." };
  }
  const active = entries
    .filter((entry) => isScheduleEntryActiveOn(entry, date))
    .sort((a, b) => a.air_time.localeCompare(b.air_time))
    .map((entry) => ({
      schedule_entry_id: entry.id,
      program_name: entry.program_name,
      air_time: entry.air_time.slice(0, 5),
      duration_minutes: entry.duration_minutes,
    }));
  return active.length > 0
    ? { entries: active }
    : {
        entries: [],
        note: "No programs are scheduled on that date. Every rundown will be unresolved.",
      };
}

export function copyForUnderwriter(name: string, data: ImportLookupData) {
  const wanted = normalize(name);
  const underwriter = data.underwriters.find((row) => normalize(row.name) === wanted);
  if (!underwriter) {
    return {
      copy: [],
      note: `No underwriter named "${name}" is on file. If the credit is really for someone not listed, use "NEW" with new_underwriter_name.`,
    };
  }
  const copy = data.copy
    .filter((row) => row.underwriter_id === underwriter.id)
    .map((row) => ({
      copy_id: row.id,
      label: row.label,
      cart: row.cart_identifier,
      duration_seconds: row.duration_seconds,
      script_opening: openingWords(row.script),
    }));
  return copy.length > 0
    ? { underwriter: underwriter.name, copy }
    : {
        underwriter: underwriter.name,
        copy: [],
        note: "No copy on file yet — every credit for this underwriter is new copy.",
      };
}

export function searchContentItems(query: string, items: PlanContentItem[]) {
  const target = normalize(query);
  const tokens = tokenize(query);
  if (target === "") return { matches: [], note: "Empty query." };

  const scored = items
    .map((item) => {
      const title = normalize(item.title);
      if (title === "") return null;
      const exact = title === target || title.includes(target) || target.includes(title);
      const hits = tokens.filter((token) => title.includes(token)).length;
      if (!exact && hits === 0) return null;
      return { item, score: (exact ? 100 : 0) + hits, length: title.length };
    })
    .filter((row): row is { item: PlanContentItem; score: number; length: number } => row !== null)
    .sort((a, b) => b.score - a.score || a.length - b.length)
    .slice(0, MAX_CONTENT_MATCHES)
    .map(({ item }) => ({
      content_item_id: item.id,
      title: item.title,
      content_type: item.content_type,
    }));

  return scored.length > 0
    ? { matches: scored }
    : {
        matches: [],
        note: "Nothing in the library resembles this title — keep it as a live_read.",
      };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(value: string): string[] {
  return (
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      // Two-letter tokens ("id", "of", "1a") match inside almost any title;
      // a short query still matches whole, through the containment check.
      .filter((token) => token.length >= 3)
  );
}

function openingWords(script: string | null): string | null {
  if (!script) return null;
  const words = script.trim().split(/\s+/);
  const opening = words.slice(0, SCRIPT_OPENING_WORDS).join(" ");
  return words.length > SCRIPT_OPENING_WORDS ? `${opening}…` : opening;
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
