// Type, spacing, radii, shadows and layout. Sizes for headlines and article text come from the
// canvas's shared-components board (15): headlines 52/44/30, lede 21, article body 20, UI 15–16,
// labels 11–12 uppercase. Families are the design system's (Source Serif 4 / Source Sans 3).

export const fontFamilies = {
  sans: '"Source Sans 3", "Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: '"Source Serif 4", Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
} as const;

export interface TypeStyle {
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  family: keyof typeof fontFamilies;
  letterSpacing?: string;
  uppercase?: boolean;
}

export const typeScale = {
  "headline-xl": { fontSize: "52px", lineHeight: "1.08", fontWeight: 700, family: "serif", letterSpacing: "-0.015em" },
  "headline-lg": { fontSize: "44px", lineHeight: "1.1", fontWeight: 700, family: "serif", letterSpacing: "-0.01em" },
  "headline-md": { fontSize: "30px", lineHeight: "1.15", fontWeight: 700, family: "serif" },
  "headline-sm": { fontSize: "22px", lineHeight: "1.25", fontWeight: 700, family: "serif" },
  lede: { fontSize: "21px", lineHeight: "1.45", fontWeight: 400, family: "serif" },
  "article-body": { fontSize: "20px", lineHeight: "1.65", fontWeight: 400, family: "serif" },
  body: { fontSize: "16px", lineHeight: "1.6", fontWeight: 400, family: "sans" },
  ui: { fontSize: "15px", lineHeight: "1.4", fontWeight: 600, family: "sans" },
  caption: { fontSize: "12px", lineHeight: "1.5", fontWeight: 400, family: "sans" },
  label: { fontSize: "12px", lineHeight: "1.3", fontWeight: 700, family: "sans", letterSpacing: "0.08em", uppercase: true },
  badge: { fontSize: "11px", lineHeight: "1.2", fontWeight: 700, family: "sans", letterSpacing: "0.08em", uppercase: true },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof typeScale;

/** 4px base scale (design system s-1 … s-9). */
export const spacing = {
  "s-1": "4px",
  "s-2": "8px",
  "s-3": "12px",
  "s-4": "16px",
  "s-5": "24px",
  "s-6": "32px",
  "s-7": "48px",
  "s-8": "64px",
  "s-9": "96px",
} as const;

export const radii = {
  "r-0": "0",
  "r-1": "2px",
  "r-2": "4px",
  "r-3": "8px",
  "r-pill": "999px",
} as const;

export const shadows = {
  "shadow-1": "0 1px 2px rgba(15,20,25,0.06), 0 1px 1px rgba(15,20,25,0.04)",
  "shadow-2": "0 2px 8px rgba(15,20,25,0.08), 0 1px 2px rgba(15,20,25,0.04)",
  "shadow-3": "0 8px 24px rgba(15,20,25,0.10), 0 2px 6px rgba(15,20,25,0.06)",
} as const;

export const layout = {
  /** Content width. */
  container: "1240px",
  /** Article text column. */
  containerNarrow: "760px",
  /** Sticky header height. */
  headerHeight: "64px",
  /** Minimum touch target (canvas: "Touch targets ≥44px"). */
  touchTarget: "44px",
} as const;
