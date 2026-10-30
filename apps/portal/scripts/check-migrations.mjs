#!/usr/bin/env node
// Fails if any migration in supabase/migrations/ hasn't been recorded as
// applied to both Supabase projects in APPLIED.md.
//
// Why this exists: migrations here are not self-applying, and nothing in
// `npm run build`, `npm test`, or a Vercel deploy applies them. The failure
// mode is silent — the code ships, the table doesn't exist, and the tool looks
// broken in a way that reads like a UI bug. This turns "did anyone remember?"
// into a command with an answer.
//
// It deliberately checks the repo against itself rather than phoning the live
// projects: no credentials, no network, runs anywhere, and the thing it
// enforces is that a human actually looked. Reconciling the ledger against a
// project's real history is a separate, manual step — see APPLIED.md.
//
// Zero dependencies, on purpose; this must never be the reason a check fails.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");
const ledgerPath = join(migrationsDir, "APPLIED.md");

const APPLIED_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(lines) {
  console.error(`\n✖ ${lines[0]}`);
  for (const line of lines.slice(1)) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

// --- Read the migration files -------------------------------------------------

let migrationFiles;
try {
  migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
} catch (error) {
  fail([`Could not read ${migrationsDir}`, String(error)]);
}

// --- Read the ledger ----------------------------------------------------------

let ledger;
try {
  ledger = readFileSync(ledgerPath, "utf8");
} catch {
  fail([
    "supabase/migrations/APPLIED.md is missing.",
    "It is the record of which migrations have been applied to which project.",
  ]);
}

/**
 * Rows look like:
 *   | `20260722120000_platform_schema.sql` | 2026-07-22 | 2026-07-22 |
 * Anything that isn't a three-cell row whose first cell is a backticked .sql
 * filename is prose or table furniture, and is skipped.
 */
const rows = new Map();
const duplicates = [];

for (const line of ledger.split("\n")) {
  const match = line.match(/^\|\s*`([^`]+\.sql)`\s*\|([^|]*)\|([^|]*)\|\s*$/);
  if (!match) continue;

  const [, file, preview, production] = match;
  if (rows.has(file)) duplicates.push(file);
  rows.set(file, { preview: preview.trim(), production: production.trim() });
}

if (rows.size === 0) {
  fail([
    "No migration rows found in supabase/migrations/APPLIED.md.",
    "Expected rows like: | `20260722120000_platform_schema.sql` | 2026-07-22 | 2026-07-22 |",
  ]);
}

// --- Compare ------------------------------------------------------------------

const problems = [];

for (const file of duplicates) {
  problems.push(`${file} — listed more than once in APPLIED.md.`);
}

for (const file of migrationFiles) {
  const row = rows.get(file);
  if (!row) {
    problems.push(
      `${file} — no row in APPLIED.md. Apply it to preview, then production, then record both dates.`,
    );
    continue;
  }
  for (const [environment, value] of [
    ["preview", row.preview],
    ["production", row.production],
  ]) {
    if (!APPLIED_DATE.test(value)) {
      problems.push(
        `${file} — ${environment} is "${value || "(empty)"}", not a YYYY-MM-DD date. ` +
          `Apply it to ${environment} and record the date it landed.`,
      );
    }
  }
}

for (const file of rows.keys()) {
  if (!migrationFiles.includes(file)) {
    problems.push(`${file} — listed in APPLIED.md but no such file in supabase/migrations/.`);
  }
}

if (problems.length > 0) {
  fail([
    `${problems.length} migration ledger problem${problems.length === 1 ? "" : "s"}:`,
    ...problems,
    "",
    "See supabase/migrations/APPLIED.md for how to apply one.",
  ]);
}

console.log(
  `✓ ${migrationFiles.length} migrations, all recorded as applied to preview and production.`,
);
