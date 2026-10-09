/** Small text helpers shared across tools. Pure. */

/** Runs of whitespace (including newlines) collapsed to single spaces, trimmed. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Words separated by whitespace; 0 for blank text. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * At most `max` characters, ending in "…" when it had to cut (so the result,
 * ellipsis included, never exceeds `max`). Trailing space before the cut is
 * dropped.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/**
 * Lowercase, hyphen-joined, ASCII-only: accents fold ("Café" → "cafe"),
 * "&" reads as "and". Capped at `max` characters without a trailing hyphen;
 * `fallback` stands in for text with nothing alphanumeric in it.
 */
export function slugify(text: string, options: { max?: number; fallback?: string } = {}): string {
  const { max = 80, fallback = "" } = options;
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || fallback;
}
