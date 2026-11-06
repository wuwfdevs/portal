import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The script that clears WUWF's data for a new station (supabase/install/clear-seed-data-for-new-station.sql)
 * is destructive by design. These tests keep it from drifting into something that could run on a station
 * that has data, and keep the CI job that proves it from ever being pointed at a hosted project. They read
 * the files as text; the real check is the "Fresh install" workflow, which runs the script on an empty
 * database. See docs/new-station-install-data.md.
 */

const root = process.cwd();
const script = readFileSync(
  join(root, "supabase/install/clear-seed-data-for-new-station.sql"),
  "utf8",
);
const workflow = readFileSync(resolve(root, "../../.github/workflows/fresh-install.yml"), "utf8");
const migrationsDir = join(root, "supabase/migrations");

/** The script without its `--` comments, so prose cannot satisfy or trip a check. */
const code = script.replace(/--.*$/gm, "");

/** The kept-table list, read the way the workflow reads it: from `v_keep` to the first `];`. */
function keptTables(): string[] {
  const block = script.slice(
    script.indexOf("v_keep text[] := array["),
    script.indexOf("];", script.indexOf("v_keep")),
  );
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

/** Every table name any migration creates in `public` (a table later dropped still sets its prefix). */
function createdTables(): string[] {
  const names = new Set<string>();
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(migrationsDir, file), "utf8").replace(/--.*$/gm, "");
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi,
    )) {
      names.add(m[1]!);
    }
  }
  return [...names];
}

describe("the clearing script's guard", () => {
  it("checks for a station settings row, accounts and a named station", () => {
    expect(code).toMatch(/not exists \(select 1 from public\.station_settings where id\)/);
    expect(code).toMatch(/exists \(select 1 from public\.profiles\)/);
    expect(code).toMatch(/station_settings where id and display_name is not null/);
  });

  it("makes all three checks before it changes anything", () => {
    const firstChange = code.search(/\b(truncate|delete\s+from|update\s+public)\b/i);
    expect(firstChange).toBeGreaterThan(0);
    for (const check of [
      /exists \(select 1 from public\.profiles\)/,
      /display_name is not null/,
      /not exists \(select 1 from public\.station_settings where id\)/,
    ]) {
      expect(code.search(check)).toBeLessThan(firstChange);
    }
  });

  it("never cascades: a kept table that points at an emptied one must fail, not be emptied", () => {
    expect(code).not.toMatch(/\bcascade\b/i);
    expect(code).toMatch(/truncate table .* restart identity/);
  });

  it("does not manage its own transaction, so a refusal leaves the database untouched", () => {
    expect(code).not.toMatch(/^\s*(begin|commit|rollback)\s*;/im);
  });

  it("is not a migration: it lives under install/, and no migration runs it", () => {
    expect(readdirSync(migrationsDir).filter((f) => f.includes("clear-seed"))).toEqual([]);
  });
});

describe("the clearing script's classification", () => {
  const kept = keptTables();

  it("reads the kept list the same way the workflow does", () => {
    expect(kept.length).toBeGreaterThan(15);
    for (const platform of [
      "profiles",
      "tools",
      "tool_access",
      "station_settings",
      "audit_events",
    ]) {
      expect(kept).toContain(platform);
    }
  });

  it("keeps only tables that exist", () => {
    const created = new Set(createdTables());
    expect(kept.filter((name) => !created.has(name))).toEqual([]);
  });

  it("keeps none of WUWF's operational tools", () => {
    const wuwfOperational = /^(log|uw|bk|tw|ri|al|ei|rd)_/;
    const offenders = kept.filter(
      (name) =>
        wuwfOperational.test(name) && name !== "uw_industry_categories" && name !== "bk_settings",
    );
    expect(offenders).toEqual([]);
  });

  it("knows every tool prefix, so a new module has to be classified before it ships", () => {
    const KNOWN = new Set([
      "profiles",
      "tools",
      "tool",
      "access",
      "audit",
      "station",
      "ep",
      "tw",
      "ri",
      "al",
      "sw",
      "rd",
      "ap",
      "log",
      "uw",
      "ei",
      "rc",
      "bk",
    ]);
    const unknown = [...new Set(createdTables().map((name) => name.split("_")[0]!))].filter(
      (prefix) => !KNOWN.has(prefix),
    );
    expect(
      unknown,
      "a new table prefix: decide in clear-seed-data-for-new-station.sql whether a fresh install keeps or empties it, then add it here",
    ).toEqual([]);
  });

  it("writes neutral copy: no station name in any statement", () => {
    expect(code).not.toMatch(/WUWF|\bUWF\b|Pensacola|Escambia|wuwf\.org/);
  });
});

describe("the fresh-install workflow", () => {
  it("talks only to the local database", () => {
    expect(workflow).toMatch(
      /DB_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/,
    );
    expect(workflow).toMatch(/Refuse any database that is not on this machine/);
  });

  it("has no access to any hosted project", () => {
    expect(workflow).not.toMatch(/secrets\./);
    expect(workflow).not.toMatch(/SUPABASE_(ACCESS_TOKEN|SECRET_KEY|DB_PASSWORD)/);
    // `db push --local` can only reach the stack this job starts; any other push could reach a linked project.
    expect(workflow).not.toMatch(/--linked|supabase\s+link/);
    expect(workflow).not.toMatch(/db\s+push(?!\s+--local)/);
    expect(workflow).not.toMatch(/--db-url/);
  });

  it("builds without the sample-data seed and on the same Postgres major as the hosted projects", () => {
    expect(workflow).toMatch(/db\.seed\]\\nenabled = false/);
    expect(workflow).toMatch(/major_version = 17/);
  });

  it("proves both refusals and a second run", () => {
    expect(workflow).toMatch(/refuses a database that has a named station/);
    expect(workflow).toMatch(/refuses a database that has an account/);
    expect(workflow).toMatch(/Running the script again changes nothing/);
  });

  it("runs only when the migrations or the install files change, or by hand", () => {
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/apps\/portal\/supabase\/migrations\/\*\*/);
    expect(workflow).toMatch(/apps\/portal\/supabase\/install\/\*\*/);
    expect(workflow).toMatch(/apps\/portal\/supabase\/baseline\/\*\*/);
  });

  it("keeps every database in both jobs on this machine", () => {
    for (const url of workflow.match(/postgresql:\/\/[^\s"]+/g) ?? []) {
      expect(url, url).toMatch(/^postgresql:\/\/postgres:postgres@127\.0\.0\.1:/);
    }
  });

  it("installs from the baseline, never by replaying the migrations through the CLI", () => {
    expect(workflow).toMatch(/supabase\/baseline\/schema\.sql/);
    expect(workflow).toMatch(/supabase\/baseline\/product-data\.sql/);
    expect(workflow).toMatch(/mv supabase\/migrations "\$RUNNER_TEMP\/migrations"/);
  });
});
