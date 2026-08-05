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
 * postMessage contract with a host we cannot test from here"). The public
 * form is a multi-step wizard (one short screen at a time, per the brief),
 * so unlike a single long page this only has to fit the *tallest single
 * step* — the "choose your track(s)" step, with six labeled checkboxes and
 * their descriptions — not the whole form at once.
 */
export const EMBED_HEIGHT = 780;

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
