// Pure helpers for the two things a reporter copies out of the Share tab: the
// standalone public URL and the Grove-ready iframe snippet. No Supabase, no
// React — the point of putting this here is that "what exactly gets pasted into
// a published article" is testable.

/** The standalone participation page — also the fallback when an embed can't get the mic. */
export function publicQueryUrl(siteUrl: string, publicId: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/listen/${publicId}`;
}

/** The chrome-free variant an iframe points at. */
export function embedQueryUrl(siteUrl: string, publicId: string): string {
  return `${publicQueryUrl(siteUrl, publicId)}/embed`;
}

/**
 * A height that fits the tallest step of the flow without the iframe scrolling
 * internally.
 *
 * There is no resizer script here, by choice (see design doc §6): shipping one
 * into someone else's page means a postMessage contract with a host we cannot
 * test against from here. Instead the flow is built so no step needs internal
 * scrolling, and this number is generous enough for the tallest of them — the
 * final review list, which grows by one row per question.
 */
export function recommendedEmbedHeight(questionCount: number): number {
  const height = 560 + Math.max(0, questionCount) * 20;
  return Math.min(760, Math.max(560, height));
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
 * The snippet for a Grove Responsive Embed element. The reporter should never
 * have to edit HTML, so everything that matters is filled in:
 *
 * - `title` is the accessible name a screen reader announces for the frame;
 * - `allow="microphone"` is the Permissions-Policy delegation without which
 *   getUserMedia inside a cross-origin iframe rejects outright, and which no
 *   amount of code on our side can substitute for;
 * - `width="100%"` keeps it inside the article column;
 * - `loading="lazy"` keeps an embed far down a page off the critical path.
 */
export function buildGroveEmbedCode(params: {
  siteUrl: string;
  publicId: string;
  title: string;
  questionCount: number;
}): string {
  const src = embedQueryUrl(params.siteUrl, params.publicId);
  const height = recommendedEmbedHeight(params.questionCount);

  return [
    `<iframe`,
    `  src="${src}"`,
    `  title="${escapeAttribute(params.title)}"`,
    `  width="100%"`,
    `  height="${height}"`,
    `  style="border:0;max-width:100%"`,
    `  allow="microphone"`,
    `  loading="lazy">`,
    `</iframe>`,
  ].join("\n");
}
