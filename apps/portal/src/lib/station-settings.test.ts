import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_STATION_TIME_ZONE } from "./station-time";

/**
 * The station's clock has two halves that must agree: the TypeScript one (lib/station-time.ts, from
 * NEXT_PUBLIC_STATION_TIME_ZONE) and the database one (`private.station_time_zone()`, from
 * public.station_settings). Five SQL functions and about seventy TypeScript files used to name
 * America/Chicago directly, so a station in another zone would have had the right TypeScript and the wrong
 * database, or the reverse. These tests keep a literal from creeping back in.
 *
 * Reads migrations and source as text, like sql-twins.test.ts. Nothing here runs SQL.
 */

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");

const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

function withoutSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

/** The latest definition (by migration order) of every `private.*` and `public.*` function. */
function latestFunctionBodies(): Map<string, { body: string; file: string }> {
  const latest = new Map<string, { body: string; file: string }>();
  for (const file of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const definition =
      /create\s+(?:or\s+replace\s+)?function\s+(private|public)\.([a-z_0-9]+)\s*\(([\s\S]*?)\$\$;/gi;
    for (const match of sql.matchAll(definition)) {
      latest.set(`${match[1]}.${match[2]}`, { body: match[3] ?? "", file });
    }
  }
  return latest;
}

describe("the station clock in SQL", () => {
  const functions = latestFunctionBodies();

  it("finds the functions that tell the time", () => {
    for (const name of [
      "public.uw_station_today",
      "public.bk_station_today",
      "public.uw_station_local_time",
      "private.log_is_automated",
      "private.log_is_closed_to_underwriting",
      "private.station_time_zone",
    ]) {
      expect(functions.has(name), `${name} is not defined in any migration`).toBe(true);
    }
  });

  it("names no time zone in any function's latest definition", () => {
    // `at time zone 'UTC'` is a conversion, not the station's clock; a station's own zone must come from
    // private.station_time_zone().
    const offenders = [...functions]
      .filter(([, { body }]) =>
        [...withoutSqlComments(body).matchAll(/at\s+time\s+zone\s+'([^']+)'/gi)].some(
          (m) => (m[1] ?? "").toUpperCase() !== "UTC",
        ),
      )
      .map(([name, { file }]) => `${name} (latest definition in ${file})`);
    expect(
      offenders,
      "ask private.station_time_zone() instead of naming a zone in a function",
    ).toEqual([]);
  });

  it("has each clock function ask private.station_time_zone()", () => {
    for (const name of [
      "public.uw_station_today",
      "public.bk_station_today",
      "public.uw_station_local_time",
      "private.log_is_automated",
      "private.log_is_closed_to_underwriting",
    ]) {
      expect(withoutSqlComments(functions.get(name)?.body ?? ""), name).toMatch(
        /private\.station_time_zone\(\)/,
      );
    }
  });

  it("does not declare a function that reads the zone from the table `immutable`", () => {
    // A function that reads a table cannot be immutable; Postgres would cache a stale zone in an index
    // or plan. The functions that ask private.station_time_zone() must be stable or volatile.
    const offenders = [...functions]
      .filter(([, { body }]) => /private\.station_time_zone\(\)/.test(withoutSqlComments(body)))
      .filter(([, { body }]) => /\bimmutable\b/i.test(withoutSqlComments(body)))
      .map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it("seeds the same default zone the code defaults to", () => {
    const sql = withoutSqlComments(
      readFileSync(join(migrationsDir, "20261105200000_station_settings.sql"), "utf8"),
    );
    const seeded = sql.match(
      /insert\s+into\s+public\.station_settings\s*\(id,\s*time_zone\)\s*values\s*\(true,\s*'([^']+)'\)/i,
    )?.[1];
    const columnDefault = sql.match(/time_zone\s+text\s+not\s+null\s+default\s+'([^']+)'/i)?.[1];
    expect(seeded).toBe(DEFAULT_STATION_TIME_ZONE);
    expect(columnDefault).toBe(DEFAULT_STATION_TIME_ZONE);
  });
});

describe("the station clock in TypeScript", () => {
  it("names no time zone outside lib/station-time.ts", () => {
    const srcDir = join(root, "src");
    const offenders = (readdirSync(srcDir, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
      .map((file) => join(srcDir, file))
      .filter((path) => relative(root, path) !== join("src", "lib", "station-time.ts"))
      // NPR's feed is scheduled on Eastern time whatever zone the station is in: this is the network's
      // clock (hourInEastern), not the station's.
      .filter((path) => relative(root, path) !== join("src", "lib", "log", "npr-story-times.ts"))
      // Fixtures are recorded real-world data, not behavior.
      .filter((path) => !path.includes(`${join("src", "lib")}${"/underwriting/fixtures/"}`))
      .filter((path) => {
        const code = readFileSync(path, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return /["'`]America\/(Chicago|New_York|Denver|Los_Angeles|Detroit)["'`]/.test(code);
      })
      .map((path) => relative(root, path));
    expect(offenders, "import STATION_TIME_ZONE from @/lib/station-time").toEqual([]);
  });
});
