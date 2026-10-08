/**
 * A starting title for a new excerpt, from the words it covers: the first few
 * words, with trailing punctuation dropped and the first letter capitalized.
 * The reporter can overwrite it at once or rename it later; a suggestion
 * costs a keystroke less than a blank box on every excerpt.
 */
export function suggestExcerptTitle(excerpt: string, maxWords = 8): string {
  const words = excerpt.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const title = words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[\s,;:\-–—.!?"'“”]+$/u, "");
  return title.charAt(0).toUpperCase() + title.slice(1);
}
