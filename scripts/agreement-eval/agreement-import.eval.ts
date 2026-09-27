// The agreement reader's eval: every PDF in ./fixtures goes through the
// real model call (lib/underwriting/agreement-ai-import.ts) and the
// resulting proposal is compared, line for line, to the hand-read
// transcription of the same order in
// src/lib/underwriting/fixtures/insertion-orders.ts — the acceptance corpus
// the traffic redesign was checked against. Unlike the program-log eval,
// the expected answer is not recorded from a reviewed run: it already
// exists, read from the signed originals by a person. Run with
// `npm run eval:agreement`; see README.md alongside for the env it needs
// and which Drive documents map to which fixture.

import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readAgreementWithAI } from "@/lib/underwriting/agreement-ai-import";
import {
  proposeScheduleFromModelOutput,
  type AgreementProposal,
} from "@/lib/underwriting/agreement-import";
import { parseEntrySpec, type EntrySpec } from "@/lib/underwriting/demand-compiler";
import { parseScheduleLineForm } from "@/lib/underwriting/schedule-line-form";
import {
  ALL_ORDERS,
  type FixtureLine,
  type FixtureOrder,
} from "@/lib/underwriting/fixtures/insertion-orders";
import { FIXTURE_DOCUMENTS, POOL_NAMES, PROGRAM_NAMES } from "./fixtures";

const EVAL_DIR = path.resolve(__dirname);
const FIXTURES_DIR = path.join(EVAL_DIR, "fixtures");
const ACTUAL_DIR = path.join(EVAL_DIR, "actual");

loadEnvLocal(path.resolve(EVAL_DIR, "../../.env.local"));

const ready = Boolean(process.env.OPENAI_API_KEY);

const present = FIXTURE_DOCUMENTS.filter((doc) => existsSync(path.join(FIXTURES_DIR, doc.file)));

describe.skipIf(!ready)("agreement reading against the insertion-order corpus", () => {
  if (!ready) {
    console.warn("Skipping: OPENAI_API_KEY is needed (in the environment or .env.local).");
  }
  if (present.length === 0) {
    it("has no fixture documents", () => {
      console.warn(
        `No PDFs found in ${path.relative(process.cwd(), FIXTURES_DIR)} — see README.md for which Drive documents to add.`,
      );
    });
  }

  for (const doc of present) {
    it(doc.file, async () => {
      const order = ALL_ORDERS.find((candidate) => candidate.name === doc.order);
      if (!order) throw new Error(`No fixture order named "${doc.order}" in insertion-orders.ts`);

      const bytes = new Uint8Array(readFileSync(path.join(FIXTURES_DIR, doc.file)));
      const read = await readAgreementWithAI({
        document: { bytes, filename: doc.file, contentType: "application/pdf" },
        underwriterNames: [doc.underwriterName],
        poolNames: POOL_NAMES,
        programNames: PROGRAM_NAMES,
        // What a staffer would have typed before uploading: nothing — the
        // document is the only source, which is what the eval measures.
        typed: {
          underwriterName: null,
          contractIdentifier: null,
          effectiveFrom: null,
          effectiveTo: null,
        },
      });
      if (!read.ok) throw new Error(read.error);

      const proposal = proposeScheduleFromModelOutput(read.output, {
        pools: POOL_NAMES.map((name) => ({ id: name, name })),
        programs: PROGRAM_NAMES.map((name) => ({ id: name, name })),
        flights: [],
      });

      const actual = digestProposal(proposal, read.output.order);
      mkdirSync(ACTUAL_DIR, { recursive: true });
      writeFileSync(
        path.join(ACTUAL_DIR, doc.file.replace(/\.pdf$/i, ".json")),
        `${JSON.stringify({ raw: read.output, ...actual }, null, 2)}\n`,
      );

      const expected = digestFixture(order);
      expect(actual.lines).toEqual(expected.lines);
      expect(actual.order).toEqual(expected.order);
      // The document should name the sponsor on file, not a new one.
      expect(read.output.order.underwriter).toBe(doc.underwriterName);
    });
  }
});

/** One line reduced to what a reviewer checks against the document: the rule, days, where, when, and the order's own count. */
interface LineDigest {
  spec: EntrySpec;
  days: number[];
  pool: string | null;
  program: string | null;
  time_mode: string;
  preferred_time: string | null;
  window_start: string | null;
  window_end: string | null;
  max_per_day: number | null;
  service_level: string;
  start_date: string;
  end_date: string | null;
  stated_total: number | null;
}

interface OrderDigest {
  stated_total_spots: number | null;
  affidavit_required: boolean;
  makegood_requires_agency_approval: boolean;
  separation_source_text: string | null;
}

function normalizeSpec(spec: EntrySpec): EntrySpec {
  switch (spec.kind) {
    case "explicit_dates":
      return {
        kind: spec.kind,
        dates: [...spec.dates].sort((a, b) => a.date.localeCompare(b.date)),
      };
    case "week_grid":
      return {
        kind: spec.kind,
        weeks: [...spec.weeks].sort((a, b) => a.week_start.localeCompare(b.week_start)),
      };
    case "every_n_weeks":
      return { kind: spec.kind, interval_weeks: spec.interval_weeks, quantity: spec.quantity };
    default:
      return spec;
  }
}

function sortDigests(lines: LineDigest[]): LineDigest[] {
  const key = (line: LineDigest) =>
    [
      line.start_date,
      line.end_date ?? "",
      line.pool ?? "",
      line.program ?? "",
      line.spec.kind,
      line.days.join(""),
      line.time_mode,
      line.preferred_time ?? line.window_start ?? "",
    ].join("|");
  return [...lines].sort((a, b) => key(a).localeCompare(key(b)));
}

function digestFixtureLine(line: FixtureLine): LineDigest {
  return {
    spec: normalizeSpec(line.spec),
    days: [...line.days_of_week].sort((a, b) => a - b),
    pool: line.pool,
    program: line.program,
    time_mode: line.time_mode,
    preferred_time: line.preferred_time,
    window_start: line.window_start,
    window_end: line.window_end,
    max_per_day: line.max_per_day,
    service_level: line.service_level,
    start_date: line.start_date,
    end_date: line.end_date,
    stated_total: line.stated_total,
  };
}

function digestFixture(order: FixtureOrder): { lines: LineDigest[]; order: OrderDigest } {
  return {
    lines: sortDigests(
      order.lines.filter((line) => line.status === "active").map(digestFixtureLine),
    ),
    order: {
      stated_total_spots: order.stated_total_spots,
      affidavit_required: order.affidavit_required,
      makegood_requires_agency_approval: order.makegood_requires_agency_approval,
      separation_source_text: order.separation_source_text,
    },
  };
}

function digestProposal(
  proposal: AgreementProposal,
  modelOrder: {
    stated_total_spots: number | null;
    affidavit_required: boolean | null;
    makegood_requires_agency_approval: boolean | null;
    separation_source_text: string | null;
  },
): {
  lines: LineDigest[];
  order: OrderDigest;
  unresolved: unknown;
  notes: string[];
  warnings: string[][];
} {
  const lines: LineDigest[] = [];
  for (const line of proposal.lines) {
    const parsed = parseScheduleLineForm(line.values);
    if (!parsed.ok) {
      // A line that doesn't compile shows up as a mismatch through its absence;
      // its errors are in actual/ for the review.
      continue;
    }
    const spec = parseEntrySpec(parsed.value.line.entry_spec);
    if (!spec) continue;
    lines.push({
      spec: normalizeSpec(spec),
      days: [...parsed.value.line.days_of_week].sort((a, b) => a - b),
      // The eval's lookups use names as ids, so the id is the name.
      pool: parsed.value.line.pool_id,
      program: parsed.value.line.program_id,
      time_mode: parsed.value.line.time_mode,
      preferred_time: parsed.value.line.preferred_time,
      window_start: parsed.value.line.window_start,
      window_end: parsed.value.line.window_end,
      max_per_day: parsed.value.line.max_per_day,
      service_level: parsed.value.line.service_level,
      start_date: parsed.value.line.start_date,
      end_date: parsed.value.line.end_date,
      stated_total: parsed.value.line.stated_total,
    });
  }
  return {
    lines: sortDigests(lines),
    order: {
      stated_total_spots: modelOrder.stated_total_spots,
      affidavit_required: modelOrder.affidavit_required === true,
      makegood_requires_agency_approval: modelOrder.makegood_requires_agency_approval === true,
      separation_source_text: modelOrder.separation_source_text,
    },
    unresolved: proposal.unresolved,
    notes: proposal.notes,
    warnings: proposal.lines.map((line) =>
      line.compile.ok ? line.warnings : [...line.compile.errors, ...line.warnings],
    ),
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
