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

/** The latest definition (by migration order) of every `private.*` and `public.*` function. */
function latestDefinitions(): Map<string, { body: string; file: string }> {
  const latest = new Map<string, { body: string; file: string }>();
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const definition =
      /create\s+(?:or\s+replace\s+)?function\s+(private|public)\.([a-z_]+)\s*\(([\s\S]*?)\$\$;/gi;
    for (const match of sql.matchAll(definition)) {
      latest.set(`${match[1]}.${match[2]}`, { body: match[3]!, file });
    }
  }
  return latest;
}

function latestPredicateBodies(): Map<string, { body: string; file: string }> {
  const predicates = new Map<string, { body: string; file: string }>();
  for (const [qualified, definition] of latestDefinitions()) {
    const [schema, name] = qualified.split(".");
    if (schema === "private" && PREDICATE.test(name!)) predicates.set(name!, definition);
  }
  return predicates;
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

/**
 * The public doors. A form or participant flow that anyone can reach is a security-definer
 * function; it must treat a switched-off tool as closed (`private.tool_is_enabled`), or an
 * administrator's switch stops the staff pages and leaves the form accepting submissions.
 * Every function granted to `anon` is covered automatically, so a new public form cannot
 * ship without the check; the participant flow is listed by hand because it is reached by an
 * anonymous *session* (role `authenticated`), which no grant marks out.
 */
/**
 * Public functions that belong to the platform, not to a tool, so there is no tool whose switch could close
 * them. `station_public_profile` is what the login page and the public forms say about the station; it
 * returns only fields meant for anyone (see its test below) and is useless to an attacker. Adding to this
 * list is a decision: say why in a comment.
 */
const PLATFORM_PUBLIC_FUNCTIONS = new Set(["public.station_public_profile"]);

describe("public entry points and cross-module reads", () => {
  const definitions = latestDefinitions();
  const bodyOf = (qualified: string) => withoutComments(definitions.get(qualified)?.body ?? "");

  const anonEntryPoints = (() => {
    const names = new Set<string>();
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
    for (const file of files) {
      const sql = withoutComments(readFileSync(join(migrationsDir, file), "utf8"));
      for (const m of sql.matchAll(
        /grant\s+execute\s+on\s+function\s+public\.([a-z_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gi,
      )) {
        if (/\banon\b/i.test(m[2]!)) names.add(`public.${m[1]}`);
      }
    }
    return [...names].sort();
  })();

  it("finds the anonymous entry points", () => {
    expect(anonEntryPoints).toEqual(
      expect.arrayContaining([
        "public.al_public_query",
        "public.ap_public_form_config",
        "public.ap_submit_inquiry",
        "public.bk_public_form_config",
        "public.bk_submit_request",
      ]),
    );
  });

  it("closes every function granted to anon when its tool is switched off", () => {
    const open = anonEntryPoints
      .filter((name) => !PLATFORM_PUBLIC_FUNCTIONS.has(name))
      .filter((name) => !/tool_is_enabled\(/.test(bodyOf(name)));
    expect(open, "add private.tool_is_enabled('<tool key>') to the function").toEqual([]);
  });

  it("closes the participant flow when Audience Listening is switched off", () => {
    for (const name of ["private.al_is_accepting", "private.al_owns_open_submission_object"]) {
      expect(bodyOf(name), `${name} must check the tool is enabled`).toMatch(
        /tool_is_enabled\('audience-listening'\)/,
      );
    }
  });

  it("keeps Bookings from reading a module that is off, or naming its data to someone without access", () => {
    expect(bodyOf("public.bk_university_avails_per_week")).toMatch(/tool_is_enabled\('log'\)/);
    const honored = bodyOf("public.bk_institutional_airtime_honored");
    expect(honored).toMatch(/tool_is_enabled\('underwriting'\)/);
    expect(honored).toMatch(/tool_is_enabled\('log'\)/);
    expect(honored).toMatch(/has_underwriting_access\(auth\.uid\(\)\)/);
    expect(honored).toMatch(/has_log_access\(auth\.uid\(\)\)/);
  });

  it("keeps the station's public profile to the fields meant for anyone", () => {
    const body = bodyOf("public.station_public_profile");
    expect(body.length).toBeGreaterThan(0);
    // The licensee, mailing address, time zone and who last edited the row are staff-only.
    for (const private_ of [
      "licensee",
      "mailing_address",
      "time_zone",
      "updated_by",
      "updated_at",
    ]) {
      expect(body, `station_public_profile must not return ${private_}`).not.toContain(private_);
    }
    expect(body).toContain("display_name");
    expect(body).toContain("support_email");
  });
});
