// The WUWF Design System's color tokens (design system "WUWF Design System", tokens.json), by the
// design system's own names. The Portal's src/lib/design-tokens.ts carries the same palette under
// Tailwind-style names (brand-primary = wuwf-blue, ink-900 = ink, line = rule, deep = surface-dark…);
// the values must stay equal, and a colour with no token here is added here first.
//
// Color roles on the public site (canvas board 15): navy = player and RadioLive, blue = actions,
// teal = fellowships, lime = on dark only, paper = history, ink = The Voyager, red = LIVE only,
// panel = disclosures.

export const colors = {
  "wuwf-blue": "#3090D0",
  "wuwf-blue-600": "#2278B8",
  "wuwf-blue-700": "#185F95",
  "wuwf-blue-100": "#D5EAF6",
  "wuwf-teal": "#204A5A",
  "wuwf-lime": "#C0E040",
  "wuwf-lime-600": "#A8C830",
  "wuwf-lime-100": "#EEF6CC",
  "on-air-red": "#D63E2D",
  ink: "#0F1419",
  "ink-2": "#2B2F36",
  "ink-3": "#5A6068",
  "ink-4": "#8A9099",
  rule: "#E2E5E9",
  "rule-strong": "#C9CED4",
  surface: "#FFFFFF",
  "surface-2": "#F5F7F9",
  "surface-3": "#ECEFF2",
  "surface-dark": "#0F2235",
  "surface-dark-line": "#2A3F55",
  "surface-dark-hover": "#16304A",
  "surface-dark-text": "#C9D3DE",
  "success-bg": "#EEF6CC",
  "success-border": "#C0E040",
  "success-fg": "#5D7A16",
  "warning-bg": "#FCEFD3",
  "warning-border": "#E3A63D",
  "warning-fg": "#8A5A12",
} as const;

export type ColorToken = keyof typeof colors;
