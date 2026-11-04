import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Disabled" has to mean disabled in the database. A tool an administrator switches off
 * at /admin/tools must stop granting access at the row-security layer, not only on the
 * portal's pages — otherwise someone who once held a grant can still read and write the
 * tool's data through a direct PostgREST call.
 *
 * This happened twice: seven predicates omitted `t.enabled` until 20260824140000 fixed
 * them, and three written afterwards copied the old shape and omitted it again. A
 * predicate is redefined by later migrations, so only its LATEST definition counts; this
 * reads the migrations in order and keeps the last body of each.
 *
 * Covered: every `private.has_<tool>_access` and `private.has_tool_role`. Nothing here
 * runs SQL; like sql-twins.test.ts it reads the migrations as text.
 */

const migrationsDir = join(process.cwd(), "supabase/migrations");

const PREDICATE = /^(has_[a-z_]+_access|has_tool_role)$/;

function latestPredicateBodies(): Map<string, { body: string; file: string }> {
  const latest = new Map<string, { body: string; file: string }>();
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const definition =
      /create\s+(?:or\s+replace\s+)?function\s+private\.([a-z_]+)\s*\(([\s\S]*?)\$\$;/gi;
    for (const match of sql.matchAll(definition)) {
      const name = match[1]!;
      if (PREDICATE.test(name)) latest.set(name, { body: match[2]!, file });
    }
  }
  return latest;
}

/** Comments are not code: strip them so a mention of `t.enabled` in prose doesn't count. */
function withoutComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

describe("tool-access predicates", () => {
  const predicates = latestPredicateBodies();

  it("finds the predicates", () => {
    // If the pattern stops matching, this test would pass vacuously.
    expect([...predicates.keys()]).toEqual(
      expect.arrayContaining([
        "has_transcription_access",
        "has_bookings_access",
        "has_website_access",
        "has_tool_role",
      ]),
    );
    expect(predicates.size).toBeGreaterThanOrEqual(12);
  });

  it("checks tools.enabled in the latest definition of every predicate", () => {
    const missing = [...predicates]
      .filter(([, { body }]) => !/\bt\.enabled\b/.test(withoutComments(body)))
      .map(([name, { file }]) => `private.${name} (latest definition in ${file})`);
    expect(
      missing,
      "a grant on a disabled tool must grant nothing; add `and t.enabled` to the predicate",
    ).toEqual([]);
  });
});
