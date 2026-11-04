import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES, MODULE_KEYS } from "./modules";

/**
 * The module manifest (src/lib/modules.ts) is only useful if it cannot drift from
 * what the database and the source actually say. Nothing here needs a database: it
 * reads the migrations and the source tree as text, the same way sql-twins.test.ts
 * and resources/release-content.test.ts do.
 *
 * It exists because exactly this slipped through once: two registry rows lived only
 * in supabase/seed.sql, so a database built from migrations alone was missing them,
 * and no test noticed.
 */

const root = process.cwd();
const migrationsDir = join(root, "supabase/migrations");

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }));

/** Every non-test TypeScript source file under src/, as { path, text }. */
function sourceFiles(): { path: string; text: string }[] {
  const srcDir = join(root, "src");
  return (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
    .map((file) => {
      const path = join(srcDir, file);
      return { path: relative(root, path), text: readFileSync(path, "utf8") };
    });
}

/**
 * The statements `insert into public.tools (…) values … ;` in a migration, each
 * reduced to the keys it inserts (the first value of every row).
 */
function registryInserts(sql: string): { keys: string[]; statement: string }[] {
  const found: { keys: string[]; statement: string }[] = [];
  const start = /insert\s+into\s+public\.tools\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = start.exec(sql))) {
    const end = sql.indexOf(";", match.index);
    const statement = sql.slice(match.index, end === -1 ? undefined : end);
    const keys = [...statement.matchAll(/\(\s*'([a-z][a-z0-9-]*)'\s*,/g)].map((m) => m[1] ?? "");
    found.push({ keys, statement });
  }
  return found;
}

/** True when a registry upsert overwrites `enabled` on conflict. */
function setsEnabled(statement: string): boolean {
  return /enabled\s*=\s*excluded\.enabled/i.test(statement);
}

/**
 * Migrations written before the rule "a registry upsert never sets `enabled`". They
 * are already applied and cannot be edited; replaying one of them on an existing
 * station would overwrite that station's choice, which is why the rule exists. Do
 * not add to this list: a new registry row uses `on conflict (key) do nothing`, or
 * updates its descriptive columns only.
 */
const LEGACY_ENABLED_UPSERTS = new Set([
  "20260730170000_audience_listening.sql",
  "20260801121000_roadmap.sql",
  "20260806130000_log_foundation.sql",
  "20260803140000_academic_partnerships.sql",
  "20260807200000_underwriting_foundation.sql",
  "20260820120000_editorial_inquiry.sql",
  "20260928140000_resources.sql",
  "20261005140000_bookings_foundation.sql",
]);

describe("module manifest", () => {
  it("lists each module once", () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("has a migration that inserts every module's registry row (never only seed.sql)", () => {
    const inserted = new Set(
      migrations.flatMap((m) => registryInserts(m.sql).flatMap((i) => i.keys)),
    );
    const missing = MODULE_KEYS.filter((key) => !inserted.has(key));
    expect(missing, `no migration inserts a public.tools row for: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("has every migration-inserted registry key in the manifest", () => {
    const inserted = new Set(
      migrations.flatMap((m) => registryInserts(m.sql).flatMap((i) => i.keys)),
    );
    const unknown = [...inserted].filter((key) => !MODULE_KEYS.includes(key));
    expect(unknown, `registry rows with no manifest entry: ${unknown.join(", ")}`).toEqual([]);
  });

  it("never lets a registry upsert overwrite a station's `enabled` choice", () => {
    const offenders = migrations
      .filter((m) => !LEGACY_ENABLED_UPSERTS.has(m.name))
      .filter((m) => registryInserts(m.sql).some((i) => setsEnabled(i.statement)))
      .map((m) => m.name);
    expect(
      offenders,
      "a registry upsert sets `enabled`; use `on conflict (key) do nothing`",
    ).toEqual([]);
  });

  it("keeps the legacy allowlist honest (every entry still does it)", () => {
    const stale = [...LEGACY_ENABLED_UPSERTS].filter((name) => {
      const migration = migrations.find((m) => m.name === name);
      return !migration || !registryInserts(migration.sql).some((i) => setsEnabled(i.statement));
    });
    expect(stale, "remove these from LEGACY_ENABLED_UPSERTS").toEqual([]);
  });

  it("uses only manifest keys in access checks, role specs, Help screens and SQL", () => {
    const known = new Set(MODULE_KEYS);
    const unknown: string[] = [];

    for (const { path, text } of sourceFiles()) {
      const patterns = [
        /\b(?:requireToolAccess|assertToolAccess|getToolByKey|hasToolAccess)\(\s*"([^"]+)"/g,
        /\btoolKey:\s*"([^"]+)"/g,
      ];
      for (const pattern of patterns) {
        for (const m of text.matchAll(pattern)) {
          const key = m[1] ?? "";
          if (!known.has(key)) unknown.push(`${path}: "${key}"`);
        }
      }
    }
    for (const { name, sql } of migrations) {
      for (const m of sql.matchAll(/\bt\.key\s*=\s*'([^']+)'/g)) {
        const key = m[1] ?? "";
        if (!known.has(key)) unknown.push(`supabase/migrations/${name}: '${key}'`);
      }
    }
    expect(unknown, "tool keys with no manifest entry").toEqual([]);
  });

  it("points requires and integrates only at manifest keys, never at itself", () => {
    const problems: string[] = [];
    for (const entry of MODULES) {
      for (const [field, targets] of [
        ["requires", entry.requires],
        ["integrates", entry.integrates],
      ] as const) {
        for (const target of targets) {
          if (!MODULE_KEYS.includes(target))
            problems.push(`${entry.key}.${field}: unknown "${target}"`);
          if (target === entry.key) problems.push(`${entry.key}.${field}: depends on itself`);
        }
      }
      const both = entry.requires.filter((key) => entry.integrates.includes(key));
      if (both.length)
        problems.push(`${entry.key}: ${both.join(", ")} is both required and integrated`);
    }
    expect(problems).toEqual([]);
  });

  it("has a requires graph with no cycles", () => {
    const byKey = new Map(MODULES.map((entry) => [entry.key, entry]));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const cycles: string[] = [];

    function visit(key: string, trail: string[]) {
      if (done.has(key)) return;
      if (visiting.has(key)) {
        cycles.push([...trail, key].join(" -> "));
        return;
      }
      visiting.add(key);
      for (const target of byKey.get(key)?.requires ?? []) visit(target, [...trail, key]);
      visiting.delete(key);
      done.add(key);
    }
    for (const key of MODULE_KEYS) visit(key, []);
    expect(cycles).toEqual([]);
  });

  it("lists public routes that the middleware really serves without a session", () => {
    const middleware = readFileSync(join(root, "src/lib/supabase/middleware.ts"), "utf8");
    const block = middleware.match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/)?.[1] ?? "";
    // Strip comments first so a quoted word inside one is not read as a path.
    const publicPaths = [...block.replace(/\/\/.*$/gm, "").matchAll(/"([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    );
    expect(publicPaths.length).toBeGreaterThan(0);

    const declared = MODULES.flatMap((entry) => entry.publicRoutes);
    const notPublic = declared.filter((route) => !publicPaths.includes(route));
    expect(notPublic, "declared public routes missing from PUBLIC_PATHS").toEqual([]);

    const undeclared = publicPaths.filter((path) => !declared.includes(path));
    // /login, /request-access and /auth/callback belong to the platform, not a module.
    expect(undeclared.sort()).toEqual(["/auth/callback", "/login", "/request-access"]);
  });

  it("names environment variables once per module", () => {
    for (const entry of MODULES) {
      const names = entry.env.map((v) => v.name);
      expect(new Set(names).size, `${entry.key} repeats an env var`).toBe(names.length);
    }
  });
});
