import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { colors, fontSize } from "./design-tokens";

/**
 * The colour and type tokens (src/lib/design-tokens.ts) are the only place a hex colour or a pixel
 * font size is written. A literal elsewhere is a value the design system does not know about, and it
 * drifts: the portal once carried about sixty hand-typed brand colours and three hundred `text-[13px]`.
 * Add a token (and its entry in the WUWF Design System's Portal layer) instead of a literal.
 */

const ROOT = join(process.cwd(), "src");
const TOKENS_FILE = join("lib", "design-tokens.ts");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const FILES = sourceFiles(ROOT)
  .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }))
  .filter((file) => file.path !== TOKENS_FILE);

function findAll(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    for (const match of file.text.matchAll(new RegExp(pattern.source, "g"))) {
      const line = file.text.slice(0, match.index).split("\n").length;
      hits.push(`${file.path}:${line}  ${match[0]}`);
    }
  }
  return hits;
}

describe("design tokens", () => {
  it("writes no hex colour outside design-tokens.ts", () => {
    expect(findAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])/)).toEqual([]);
  });

  it("writes no pixel font size: use a named size (text-ui, text-label, …) or text-xs/sm/base", () => {
    expect(findAll(/\btext-\[\d+(?:\.\d+)?px\]/)).toEqual([]);
  });

  // `rounded-t-xl` stays: it is the bottom sheet's top edge (ActionMenu, excerpt sheet), a deliberate shape.
  it("keeps one corner radius: rounded, rounded-sm for small chips, rounded-full", () => {
    expect(findAll(/\brounded-(?:md|lg)\b|\brounded-\[\d+px\]/)).toEqual([]);
  });

  it("gives every colour a six-digit hex and every size a px value", () => {
    const leaves: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") leaves.push(value);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(colors);
    expect(leaves.filter((v) => !/^#[0-9A-F]{6}$/.test(v))).toEqual([]);
    expect(Object.values(fontSize).filter((v) => !/^\d+px$/.test(v))).toEqual([]);
  });
});
