import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The portal's control rules (docs/ui-patterns.md), checked against the source. These are the patterns
 * a sweep of every screen removed; each rule fails the build when one comes back, so a new screen
 * can't quietly bring the drift back. A rule that needs an exception names the file here, with why.
 */

const ROOT = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

const FILES = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

/** Where each match of `pattern` is, as `path:line`. */
function findAll(pattern: RegExp, skip: (path: string) => boolean = () => false): string[] {
  const hits: string[] = [];
  for (const file of FILES) {
    if (skip(file.path)) continue;
    const re = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    for (const match of file.text.matchAll(re)) {
      const line = file.text.slice(0, match.index).split("\n").length;
      hits.push(`${file.path}:${line}`);
    }
  }
  return hits;
}

const isUiPrimitive = (path: string) => path.startsWith("components/ui/");

describe("control rules", () => {
  it("never abbreviates a create link by hand: ListToolbar's `primary` does it", () => {
    expect(findAll(/\+ New<span className="max-sm:sr-only"/)).toEqual([]);
  });

  it("keeps a list's create action in ListToolbar's `primary` or `action`, not its children", () => {
    const hits: string[] = [];
    for (const file of FILES) {
      for (const block of file.text.matchAll(/<ListToolbar\b[\s\S]*?<\/ListToolbar>/g)) {
        if (/<PrimaryLink\b/.test(block[0])) hits.push(file.path);
      }
    }
    expect(hits).toEqual([]);
  });

  it("ends a form with FormActions: a Cancel is never a TextLink", () => {
    expect(findAll(/<TextLink\b[^>]*>\s*Cancel\s*<\/TextLink>/)).toEqual([]);
  });

  it("confirms a removal in a plain form: no ghost submit button that says Remove or Delete", () => {
    expect(findAll(/<Button\s+type="submit"\s+variant="ghost"[^>]*>\s*(Remove|Delete)\b/)).toEqual(
      [],
    );
  });

  it("places a control in a control row with the `row` prop, not a raw data-row attribute", () => {
    expect(
      findAll(/<(Button|PrimaryLink|SecondaryLink|TextLink)\b[^<]*?\bdata-row=/, isUiPrimitive),
    ).toEqual([]);
  });

  it("does not force a link-styled button below the phone tap target", () => {
    expect(
      findAll(/<(PrimaryLink|SecondaryLink)\b[^>]*className="[^"]*\b(h-9|h-8|py-0)\b/),
    ).toEqual([]);
  });

  it("does not hand-type a Prev day / Next day pair: DateStepper is the day navigation", () => {
    expect(findAll(/←\s*Prev day/, isUiPrimitive)).toEqual([]);
  });
});
