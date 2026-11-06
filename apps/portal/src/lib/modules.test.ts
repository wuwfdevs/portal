import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULES, MODULE_KEYS, dependencyBlock, missingConfiguration } from "./modules";

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

describe("dependencyBlock (the /admin/tools switch)", () => {
  const all = new Set(MODULE_KEYS);
  const without = (...keys: string[]) => new Set(MODULE_KEYS.filter((key) => !keys.includes(key)));

  it("lets a module with no dependencies be switched either way", () => {
    expect(dependencyBlock("roadmap", true, all)).toBeNull();
    expect(dependencyBlock("roadmap", false, all)).toBeNull();
  });

  it("refuses to enable a module while one it requires is off", () => {
    expect(dependencyBlock("underwriting", true, without("underwriting", "log"))).toEqual({
      kind: "needs",
      keys: ["log"],
    });
    expect(
      dependencyBlock(
        "editorial-inquiry",
        true,
        without("editorial-inquiry", "editorial-planning"),
      ),
    ).toEqual({
      kind: "needs",
      keys: ["editorial-planning"],
    });
  });

  it("allows enabling once what it requires is on", () => {
    expect(dependencyBlock("underwriting", true, without("underwriting"))).toBeNull();
  });

  it("refuses to disable a module while an enabled module requires it", () => {
    expect(dependencyBlock("log", false, all)).toEqual({
      kind: "needed-by",
      keys: ["underwriting"],
    });
    expect(dependencyBlock("editorial-planning", false, all)).toEqual({
      kind: "needed-by",
      keys: ["editorial-inquiry"],
    });
  });

  it("allows disabling a module whose dependents are already off", () => {
    expect(dependencyBlock("log", false, without("underwriting"))).toBeNull();
  });

  it("never blocks on a soft integration", () => {
    // Audience Listening and Bookings only integrate with these; they keep working without them.
    expect(dependencyBlock("transcription", false, all)).toBeNull();
    expect(dependencyBlock("underwriting", false, all)).toBeNull();
    expect(
      dependencyBlock("bookings", true, without("bookings", "underwriting", "log")),
    ).toBeNull();
  });

  it("has nothing to say about a key the manifest does not list", () => {
    expect(dependencyBlock("newsletter-builder", true, new Set())).toBeNull();
    expect(dependencyBlock("newsletter-builder", false, all)).toBeNull();
  });
});

describe("capability tool keys", () => {
  it("name only manifest modules", () => {
    const unknown: string[] = [];
    for (const { path, text } of sourceFiles()) {
      for (const m of text.matchAll(/\brequires:\s*\{\s*tool:\s*"([^"]+)"/g)) {
        const key = m[1] ?? "";
        if (!MODULE_KEYS.includes(key)) unknown.push(`${path}: "${key}"`);
      }
    }
    expect(unknown, "a capability requires a tool that is not a module").toEqual([]);
  });
});

describe("missingConfiguration", () => {
  it("says nothing about a module that is switched off", () => {
    expect(missingConfiguration([], {})).toEqual([]);
    expect(missingConfiguration(["roadmap"], {})).toEqual([]);
  });

  it("splits what is missing into required and optional, by name", () => {
    const [sourcework] = missingConfiguration(["transcription"], { MISTRAL_API_KEY: "x" });
    expect(sourcework?.key).toBe("transcription");
    expect(sourcework?.required.map((v) => v.name)).toEqual([
      "ASSEMBLYAI_API_KEY",
      "TRANSCRIPTION_WEBHOOK_SECRET",
    ]);
    expect(sourcework?.optional.map((v) => v.name)).toEqual(["OPENAI_API_KEY"]);
  });

  it("treats a blank or whitespace value as missing, and any other value as set", () => {
    const env = { DAILY_API_KEY: "   ", DAILY_RECORDINGS_BUCKET_NAME: "b" };
    const [interview] = missingConfiguration(["remote-interview"], env);
    expect(interview?.required.map((v) => v.name)).toEqual(["DAILY_API_KEY"]);
    expect(interview?.optional.map((v) => v.name)).toEqual([
      "DAILY_RECORDINGS_BUCKET_REGION",
      "DAILY_RECORDINGS_ASSUME_ROLE_ARN",
    ]);
  });

  it("leaves out an enabled module that has everything", () => {
    const env = Object.fromEntries(
      MODULES.flatMap((entry) => entry.env.map((v) => [v.name, "set"] as const)),
    );
    expect(missingConfiguration(MODULE_KEYS, env)).toEqual([]);
  });

  it("returns names and purposes only, never a value", () => {
    const secret = "sk-this-must-not-appear";
    const found = missingConfiguration(["editorial-inquiry"], { OTHER: secret });
    expect(JSON.stringify(found)).not.toContain(secret);
  });
});
