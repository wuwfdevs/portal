// The program-log importer's eval: every PDF in ./fixtures goes through the
// real model call (lib/log/program-log-ai-import.ts) with lookups served
// from a real database, and the resulting plan is compared to a reviewed
// expected plan in ./expected. This is how the importer's quality is
// measured — there is deliberately no verification layer in the importer
// itself (docs/log-design.md §8, 2026-09-22), so a model version change or
// a new station's export shows up here as a diff rather than as a
// production report. Run with `npm run eval:program-log`; see README.md
// alongside for the env it needs and how to review and commit an expected
// plan.

import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { importProgramLogWithAI } from "@/lib/log/program-log-ai-import";
import { assembleProgramLogPlan, type ProgramLogPlan } from "@/lib/log/program-log-plan";
import type { ImportLookupData } from "@/lib/log/program-log-lookups";

const EVAL_DIR = path.resolve(__dirname);
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");
const EXPECTED_DIR = path.join(EVAL_DIR, "expected");
const ACTUAL_DIR = path.join(EVAL_DIR, "actual");

loadEnvLocal(path.resolve(EVAL_DIR, "../../.env.local"));

const openaiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
const ready = Boolean(openaiKey && supabaseUrl && supabaseSecret);
const writeExpected = process.env.PROGRAM_LOG_EVAL_WRITE === "1";

const fixtures = existsSync(FIXTURES_DIR)
  ? readdirSync(FIXTURES_DIR)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort()
  : [];

describe.skipIf(!ready)("program-log import against real exports", () => {
  let data: ImportLookupData;

  beforeAll(async () => {
    if (!ready) {
      console.warn(
        "Skipping: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SECRET_KEY are needed (in the environment or .env.local).",
      );
      return;
    }
    data = await loadLookupData(supabaseUrl!, supabaseSecret!);
  });

  for (const file of fixtures) {
    it(file, async () => {
      const result = await importProgramLogWithAI({
        pdf: new Uint8Array(readFileSync(path.join(FIXTURES_DIR, file))),
        filename: file,
        data,
      });
      if (!result.ok) throw new Error(result.error);

      const plan = assembleProgramLogPlan({ output: result.output, ...data, existingRundowns: [] });
      const digest = { toolCalls: result.toolCalls, ...digestPlan(plan) };

      mkdirSync(ACTUAL_DIR, { recursive: true });
      const actualPath = path.join(ACTUAL_DIR, file.replace(/\.pdf$/i, ".json"));
      writeFileSync(actualPath, `${JSON.stringify(digest, null, 2)}\n`);

      const expectedPath = path.join(EXPECTED_DIR, file.replace(/\.pdf$/i, ".json"));
      if (writeExpected) {
        mkdirSync(EXPECTED_DIR, { recursive: true });
        writeFileSync(expectedPath, `${JSON.stringify(digest, null, 2)}\n`);
        console.log(
          `Wrote ${path.relative(process.cwd(), expectedPath)} — review it before committing.`,
        );
        return;
      }
      if (!existsSync(expectedPath)) {
        console.log(
          `No expected plan for ${file} yet. Review ${path.relative(process.cwd(), actualPath)}, then re-run with PROGRAM_LOG_EVAL_WRITE=1 to record it.`,
        );
        return;
      }

      const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, unknown>;
      // toolCalls varies run to run and isn't part of correctness.
      expect(withoutToolCalls(digest)).toEqual(withoutToolCalls(expected));
    });
  }
});

/**
 * The plan reduced to what a reviewer judges: which programs, which breaks,
 * what's in each, and the copy the day would create or reuse — with ids
 * left out (they differ per database) and scripts whitespace-normalized.
 */
function digestPlan(plan: ProgramLogPlan) {
  return {
    airDate: plan.airDate,
    warnings: plan.warnings,
    rundowns: plan.rundowns.map((rundown) => ({
      program: rundown.programName,
      shift: `${rundown.shiftStartTime} +${rundown.shiftDurationMinutes}m`,
      breaks: rundown.breaks.map((brk) => ({
        time: brk.time,
        label: brk.label,
        window: brk.availableDurationSeconds,
        items: brk.items.map((item) =>
          item.kind === "live_read"
            ? {
                kind: item.kind,
                title: item.title,
                seconds: item.durationSeconds,
                script: normalizeText(item.script),
              }
            : { kind: item.kind, title: item.title, seconds: item.durationSeconds },
        ),
      })),
    })),
    copy: plan.copyPlans.map((copy) => ({
      underwriter: copy.underwriterName,
      newUnderwriter: copy.underwriterIsNew,
      label: copy.label,
      cart: copy.cart,
      reused: copy.existingCopyId !== null,
      scriptChanged: copy.scriptChanged,
      airings: copy.airings,
      script: normalizeText(copy.script),
    })),
    unresolved: plan.unresolved,
    notes: plan.notes,
  };
}

function withoutToolCalls(digest: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...digest };
  delete copy.toolCalls;
  return copy;
}

function normalizeText(value: string | null): string | null {
  return value === null ? null : value.replace(/\s+/g, " ").trim();
}

/**
 * Reads the same four lists the import Server Action preloads, with the
 * secret key because there is no signed-in session in a script. Read-only,
 * developer-run; this is the one place outside lib/supabase/admin.ts that
 * touches the secret key, and it never writes.
 */
async function loadLookupData(url: string, secretKey: string): Promise<ImportLookupData> {
  const supabase = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [schedule, programs, underwriters, copy, contentItems] = await Promise.all([
    supabase.from("log_schedule").select("*"),
    supabase.from("log_programs").select("id, name"),
    supabase.from("uw_underwriters").select("id, name").order("name"),
    supabase
      .from("uw_copy")
      .select("id, underwriter_id, label, cart_identifier, script, duration_seconds"),
    supabase
      .from("log_content_items")
      .select("id, title, content_type")
      .eq("approval_status", "approved"),
  ]);
  for (const result of [schedule, programs, underwriters, copy, contentItems]) {
    if (result.error) throw new Error(`Could not load lookup data: ${result.error.message}`);
  }
  const programName = new Map((programs.data ?? []).map((row) => [row.id, row.name]));
  return {
    scheduleEntries: (schedule.data ?? []).map((entry) => ({
      id: entry.id,
      program_id: entry.program_id,
      program_name: programName.get(entry.program_id) ?? "Unknown program",
      clock_template_id: entry.clock_template_id,
      air_time: entry.air_time,
      duration_minutes: entry.duration_minutes,
      entry_type: entry.entry_type,
      days_of_week: entry.days_of_week,
      start_date: entry.start_date,
      end_date: entry.end_date,
    })),
    underwriters: underwriters.data ?? [],
    copy: copy.data ?? [],
    contentItems: contentItems.data ?? [],
  };
}

/** Loads KEY=value lines from .env.local into process.env without overriding anything already set. */
function loadEnvLocal(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
