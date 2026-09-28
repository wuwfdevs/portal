import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmptyRichText, parseRichText } from "@/lib/rich-text";
import { SCREENS } from "./screens";

// Release migrations write Resources content through private.rc_release_guide()
// and private.rc_release_note() (20260928200000_resources_release_helpers.sql),
// with named arguments and $body$-quoted bodies. SQL can't run the rich-text
// whitelist, so this test does: it finds every call in supabase/migrations and
// checks what the migration would store, before it's ever applied.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

type Call = { fn: "guide" | "note"; file: string; args: Map<string, string> };

const ARG =
  /p_(\w+)\s*=>\s*(\$body\$[\s\S]*?\$body\$|'(?:[^']|'')*'(?:::\w+)?|array\[[^\]]*\](?:::[\w[\]]+)?|-?\d+|null)/g;

function readCalls(): Call[] {
  const calls: Call[] = [];
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    // Whole-line comments only: a body's text may contain "--".
    const sql = readFileSync(join(MIGRATIONS, file), "utf8").replace(/^\s*--.*$/gm, "");
    const call = /select\s+private\.rc_release_(guide|note)\s*\(/g;
    for (let match = call.exec(sql); match; match = call.exec(sql)) {
      // The call runs to the first ");" after its body, which is the last
      // argument that can contain one.
      const start = match.index + match[0].length;
      const bodyEnd = sql.indexOf("$body$", sql.indexOf("$body$", start) + 6);
      const end = sql.indexOf(");", bodyEnd < 0 ? start : bodyEnd);
      const args = new Map<string, string>();
      for (const arg of sql.slice(start, end).matchAll(ARG)) args.set(arg[1]!, arg[2]!);
      calls.push({ fn: match[1] as "guide" | "note", file, args });
    }
  }
  return calls;
}

function text(value: string | undefined): string | null {
  if (!value || value === "null") return null;
  const literal = /^'((?:[^']|'')*)'/.exec(value);
  return literal ? literal[1]!.replace(/''/g, "'") : null;
}

function array(value: string | undefined): string[] {
  const inner = /^array\[([^\]]*)\]/.exec(value ?? "")?.[1] ?? "";
  return [...inner.matchAll(/'((?:[^']|'')*)'/g)].map((item) => item[1]!.replace(/''/g, "'"));
}

function body(value: string | undefined): unknown {
  const raw = /^\$body\$([\s\S]*)\$body\$$/.exec(value ?? "")?.[1];
  return raw === undefined ? undefined : JSON.parse(raw);
}

/** Guide slugs the first Resources migration seeded with plain inserts. */
function seededGuideSlugs(): string[] {
  const sql = readFileSync(join(MIGRATIONS, "20260928140000_resources.sql"), "utf8");
  return [...sql.matchAll(/select '([a-z0-9-]+)', 'guide'::public\.rc_kind/g)].map((m) => m[1]!);
}

/** The whitelist writes `marks: []` on unmarked text; stored without it means the same. */
function withoutEmptyMarks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEmptyMarks);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => !(key === "marks" && Array.isArray(item) && item.length === 0))
      .map(([key, item]) => [key, withoutEmptyMarks(item)]),
  );
}

const calls = readCalls();
const screens = new Map(SCREENS.map((screen) => [screen.key, screen]));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("Resources release content in migrations", () => {
  it("finds the calls", () => {
    expect(calls.some((call) => call.fn === "guide")).toBe(true);
    expect(calls.some((call) => call.fn === "note")).toBe(true);
  });

  for (const call of calls) {
    const slug = text(call.args.get("slug")) ?? "(no slug)";
    describe(`${call.file}: rc_release_${call.fn} ${slug}`, () => {
      it("has a slug, a title, and a tool", () => {
        expect(slug).toMatch(SLUG);
        expect(text(call.args.get("title"))?.trim()).toBeTruthy();
        if (call.fn === "guide") expect(text(call.args.get("tool_key"))).toBeTruthy();
      });

      it("stores a body the rich-text whitelist keeps as written", () => {
        const stored = body(call.args.get("body"));
        expect(stored, "p_body must be a $body$-quoted JSON document").toBeDefined();
        const parsed = parseRichText(stored, { allowFigures: true });
        expect(parsed).not.toBeNull();
        expect(isEmptyRichText(parsed!)).toBe(false);
        // Anything the whitelist would drop is content the page would never show.
        expect(withoutEmptyMarks(parsed)).toEqual(withoutEmptyMarks(stored));
      });

      if (call.fn === "guide") {
        it("names screens that belong to its tool", () => {
          const keys = array(call.args.get("screen_keys"));
          const tool = text(call.args.get("tool_key"));
          for (const key of keys) {
            expect(screens.get(key)?.toolKey, `unknown screen ${key}`).toBe(tool);
          }
        });
      }

      if (call.fn === "note") {
        it("has a release date and links only guides that exist", () => {
          expect(text(call.args.get("released_on"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          const known = new Set([
            ...seededGuideSlugs(),
            ...calls.filter((c) => c.fn === "guide").map((c) => text(c.args.get("slug"))),
          ]);
          for (const guide of array(call.args.get("guide_slugs"))) {
            expect(known.has(guide), `no guide ${guide}`).toBe(true);
          }
        });
      }
    });
  }
});
