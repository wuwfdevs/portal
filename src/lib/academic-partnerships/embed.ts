// Pure helpers for the Settings screen's Share panel: the standalone public
// URL and the Grove-ready iframe snippet. No Supabase, no React. Mirrors
// lib/audience-listening/embed.ts, simplified: there is one fixed public
// form, not one per record, so there is no public id to thread through.

/** The standalone inquiry form — also the fallback when an embed can't load. */
export function publicFormUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/partner`;
}

/** The chrome-free variant an iframe points at. */
export function embedFormUrl(siteUrl: string): string {
  return `${publicFormUrl(siteUrl)}/embed`;
}

/** Escapes a string for use inside a double-quoted HTML attribute. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A fixed height, no resizer script — same call Audience Listening's design
 * doc §6 makes ("shipping a script into someone else's page means a
 * postMessage contract with a host we cannot test from here"). This form is
 * long and, unlike that one, does not break into one-question-at-a-time
 * steps, so the number is generous rather than tight: it fits the full
 * teaching-path form on a typical viewport, and the research path (which
 * shows more fields) scrolls within the frame rather than being cut off.
 */
export const EMBED_HEIGHT = 2600;

/**
 * The snippet for a Grove Responsive Embed element. A coordinator should
 * never have to edit HTML — title is the frame's accessible name, width/
 * height/loading match the audience-listening precedent, and there is no
 * `allow="microphone"` here: this form asks for nothing the Permissions
 * Policy needs to delegate.
 */
export function buildGroveEmbedCode(params: { siteUrl: string; title?: string }): string {
  const src = embedFormUrl(params.siteUrl);
  const title = params.title ?? "WUWF Academic Partnership Inquiry";

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
