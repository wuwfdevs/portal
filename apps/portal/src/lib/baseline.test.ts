import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The new-station baseline (supabase/baseline) is generated from WUWF's migrations and proved against them by the
 * "Fresh install" workflow. These tests read the committed files as text and catch the ways they drift or break
 * without needing a database: a migration the baseline claims but does not list, a regenerated file that lost the
 * safeguards, a generator that filters data. Whether the schema and data are RIGHT is verify.sh's job (in CI).
 */

const root = resolve(process.cwd(), "supabase");
const baseline = (name: string) => readFileSync(resolve(root, "baseline", name), "utf8");
const schema = baseline("schema.sql");
const data = baseline("product-data.sql");
const through = baseline("BASELINE_THROUGH").trim();
const migrationFiles = readdirSync(resolve(root, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("the baseline's record of itself", () => {
  const included = migrationFiles.filter((f) => f.slice(0, 14) <= through);

  it("stops at a migration that exists", () => {
    expect(through).toMatch(/^\d{14}$/);
    expect(migrationFiles.some((f) => f.startsWith(through))).toBe(true);
    expect(included.length).toBeGreaterThan(0);
  });

  it("names the same version in both headers", () => {
    expect(schema).toContain(`migrations through ${through}`);
    expect(data).toContain(`migrations through ${through}`);
  });

  it("records itself in the migration history as ONE version, the last it contains", () => {
    // Not one row per file: WUWF's folder has pairs of files that share a version, and the history table holds one
    // row per version. The CLI check in the workflow proves a newer migration applies on top of this row.
    const rows = [
      ...schema.matchAll(
        /insert into supabase_migrations\.schema_migrations \(version, name\) values \(([^)]*)\)/g,
      ),
    ];
    expect(rows.map((m) => m[1])).toEqual([`'${through}', 'baseline'`]);
  });
});

describe("schema.sql", () => {
  it("is installable on a Supabase project: extension first, defaults off while loading and restored at the end", () => {
    const create = schema.indexOf("create extension if not exists vector with schema extensions;");
    const off = schema.indexOf("revoke all on tables from anon, authenticated, service_role;");
    const firstTable = schema.indexOf("CREATE TABLE ");
    const on = schema.lastIndexOf("grant all on tables to anon, authenticated, service_role;");
    expect(create).toBeGreaterThan(-1);
    expect(create).toBeLessThan(off);
    expect(off).toBeLessThan(firstTable);
    expect(on).toBeGreaterThan(schema.lastIndexOf("CREATE POLICY"));
  });

  it("keeps check_function_bodies off (functions mention tables defined later) and has no psql meta-commands", () => {
    expect(schema).toContain("SET check_function_bodies = false;");
    expect(schema).not.toMatch(/^\\(un)?restrict /m);
  });

  it("does not create the public schema over Supabase's own", () => {
    expect(schema).not.toMatch(/^CREATE SCHEMA public;$/m);
    expect(schema).not.toMatch(/^CREATE SCHEMA private;$/m);
  });

  it("holds the pieces pg_dump cannot see: storage policies and the sign-up trigger on auth.users", () => {
    expect(schema).toMatch(/^create policy .* on storage\.objects /m);
    expect(schema).toMatch(/CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users/);
  });
});

describe("product-data.sql", () => {
  it("is one transaction and carries no account", () => {
    expect(data).toMatch(/^begin;$/m);
    expect(data.trimEnd().endsWith("commit;")).toBe(true);
    expect(data).not.toMatch(
      /INSERT INTO public\.(profiles|tool_access|access_requests|audit_events)\b/,
    );
    expect(data).not.toMatch(/auth\.users/);
  });

  it("switches triggers off while loading and back on", () => {
    const off = data.match(/disable trigger user;/g)?.length ?? 0;
    const on = data.match(/enable trigger user;/g)?.length ?? 0;
    expect(off).toBeGreaterThan(0);
    expect(on).toBe(off);
  });

  it("loads the pair of tables that point at each other without tripping their foreign keys", () => {
    const formats = data.indexOf("insert into public.sw_piece_formats select");
    const versions = data.indexOf("insert into public.sw_piece_format_versions select");
    const pointers = data.indexOf("update public.sw_piece_formats f set live_version_id");
    expect(formats).toBeGreaterThan(-1);
    expect(formats).toBeLessThan(versions);
    expect(versions).toBeLessThan(pointers);
  });
});

describe("the generator and the replay script", () => {
  const generate = baseline("generate.sh");
  const replay = baseline("replay-history.sh");

  it("filters pg_dump's output by whole lines only (a loose filter once deleted blank lines inside email templates)", () => {
    expect(generate).toMatch(/grep -v -x -E/);
    expect(generate).not.toMatch(/grep -v '\^/);
  });

  it("replays the two September migrations that cannot run in a transaction, and restores the trigger function", () => {
    expect(replay).toMatch(/20260914130000_\*\|20260914140000_\*/);
    expect(replay).toMatch(/rc_articles_before_update/);
    expect(replay).toMatch(/\[ -n "\$original_fn" \] && psql/);
  });

  it("ships everything CI and a developer need to run the replay on plain Postgres", () => {
    for (const f of ["README.md", "fingerprint.sql", "local-stubs.sql", "verify.sh"]) {
      expect(existsSync(resolve(root, "baseline", f)), f).toBe(true);
    }
  });
});
