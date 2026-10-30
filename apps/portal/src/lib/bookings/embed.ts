// Pure helpers for the intake settings screen's Share panel: the standalone
// public URL and the Grove-ready iframe snippet. No Supabase, no React.
// Mirrors lib/academic-partnerships/embed.ts — one fixed public form, so
// there is no public id to thread through (docs/bookings-design.md §6.3).

/** The standalone request form — also the fallback when an embed can't load. */
export function publicFormUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/book`;
}

/** The chrome-free variant an iframe points at. */
export function embedFormUrl(siteUrl: string): string {
  return `${publicFormUrl(siteUrl)}/embed`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A fixed height, no resizer script — the same call Audience Listening's
 * design doc §6 makes. The form is a short wizard, so this only has to fit
 * its tallest single step: "What you need", with the package checkboxes and
 * the description.
 */
export const EMBED_HEIGHT = 760;

/** The snippet for a Grove Responsive Embed element; nothing in it needs editing. */
export function buildGroveEmbedCode(params: { siteUrl: string; title?: string }): string {
  const src = embedFormUrl(params.siteUrl);
  const title = params.title ?? "Request production work from WUWF";
  return [
    `<iframe`,
    `  src="${src}"`,
    `  title="${escapeAttribute(title)}"`,
    `  width="100%"`,
    `  height="${EMBED_HEIGHT}"`,
    `  style="border:0;max-width:100%"`,
    `  loading="lazy">`,
    `</iframe>`,
  ].join("\n");
}
