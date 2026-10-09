import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Logic that exists twice — once in TypeScript (so a screen can explain a
 * decision) and once in SQL (so the database refuses a bad write whatever the
 * application does) — and has to be kept in step by hand. Nothing here proves
 * the two agree (that needs a database); this registry makes sure neither half
 * can be renamed or removed without somebody noticing, and is the one place
 * the pairs are listed. When you change one half, change the other and read
 * its test.
 */
const TWINS: { ts: string; exported: string; sql: string[] }[] = [
  { ts: "src/lib/log/automated-hours.ts", exported: "isAutomated", sql: ["log_is_automated"] },
  {
    ts: "src/lib/log/underwriting-hours.ts",
    exported: "isClosedToUnderwriting",
    sql: ["log_is_closed_to_underwriting"],
  },
  {
    ts: "src/lib/underwriting/eligibility.ts",
    exported: "EXACT_TIME_TOLERANCE_MINUTES",
    sql: [
      "uw_exact_time_tolerance",
      "uw_time_eligible",
      "uw_bucket_for_date",
      "uw_break_position_eligible",
    ],
  },
  {
    ts: "src/lib/underwriting/freeze.ts",
    exported: "automationBlockFor",
    sql: ["uw_automation_block"],
  },
  { ts: "src/lib/underwriting/rotation.ts", exported: "servesLine", sql: ["uw_copy_serves_line"] },
  { ts: "src/lib/bookings/scheduling.ts", exported: "bookingIsLive", sql: ["bk_booking_is_live"] },
  {
    ts: "src/lib/bookings/agreements.ts",
    exported: "reservedBlockState",
    sql: ["bk_reserved_block_reserves"],
  },
  { ts: "src/lib/editorial/roles.ts", exported: "normalizeToolRole", sql: ["ep_role"] },
  { ts: "src/lib/roadmap/roles.ts", exported: "normalizeToolRole", sql: ["is_roadmap_curator"] },
  {
    ts: "src/lib/academic-partnerships/roles.ts",
    exported: "normalizeToolRole",
    sql: ["is_academic_partnerships_coordinator"],
  },
  { ts: "src/lib/resources/roles.ts", exported: "normalizeToolRole", sql: ["is_resources_editor"] },
];

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

describe("SQL/TS twins", () => {
  for (const twin of TWINS) {
    it(`${twin.ts} ${twin.exported} still has its SQL counterpart`, () => {
      const source = readFileSync(join(root, twin.ts), "utf8");
      expect(source).toMatch(new RegExp(`export (async )?(function|const) ${twin.exported}\\b`));
      for (const fn of twin.sql) {
        expect(migrations).toMatch(new RegExp(`function (private\\.|public\\.)?${fn}\\b`));
      }
    });
  }
});
