// Turns tokens into CSS custom properties. The site emits these once on :root and a show's theme
// re-declares the few it changes, so a component only ever reads `var(--color-…)`.

import { colors } from "./colors";
import { fontFamilies, layout, radii, shadows, spacing } from "./scale";

const NAME = /^[a-z0-9][a-z0-9-]*$/;

function declare(prefix: string, name: string, value: string): string {
  if (!NAME.test(name)) throw new Error(`Invalid token name for CSS: ${name}`);
  return `--${prefix}-${name}: ${value};`;
}

function block(selector: string, lines: string[]): string {
  return `${selector} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}`;
}

/** The base token set as a `:root` rule. */
export function baseCss(selector = ":root"): string {
  const lines = [
    ...Object.entries(colors).map(([k, v]) => declare("color", k, v)),
    ...Object.entries(fontFamilies).map(([k, v]) => declare("font", k, v)),
    ...Object.entries(spacing).map(([k, v]) => declare("space", k.replace(/^s-/, ""), v)),
    ...Object.entries(radii).map(([k, v]) => declare("radius", k.replace(/^r-/, ""), v)),
    ...Object.entries(shadows).map(([k, v]) => declare("shadow", k.replace(/^shadow-/, ""), v)),
    declare("layout", "container", layout.container),
    declare("layout", "container-narrow", layout.containerNarrow),
    declare("layout", "header-height", layout.headerHeight),
    declare("layout", "touch-target", layout.touchTarget),
  ];
  return block(selector, lines);
}

/**
 * A scoped theme: only the properties it overrides, under a selector. A show's theme is data
 * (colors by token name, fonts by role), so launching a second show needs a record, not code.
 */
export interface ThemeOverrides {
  colors?: Partial<Record<keyof typeof colors | (string & {}), string>>;
  fonts?: Partial<Record<keyof typeof fontFamilies | (string & {}), string>>;
}

const SAFE_VALUE = /^[#a-zA-Z0-9 ,.'"()%\-_/]+$/;

export function themeCss(selector: string, theme: ThemeOverrides): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(theme.colors ?? {})) {
    if (v === undefined) continue;
    if (!SAFE_VALUE.test(v)) throw new Error(`Unsafe CSS value for color ${k}`);
    lines.push(declare("color", k, v));
  }
  for (const [k, v] of Object.entries(theme.fonts ?? {})) {
    if (v === undefined) continue;
    if (!SAFE_VALUE.test(v)) throw new Error(`Unsafe CSS value for font ${k}`);
    lines.push(declare("font", k, v));
  }
  return lines.length === 0 ? "" : block(selector, lines);
}
