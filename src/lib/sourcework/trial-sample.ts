// Pure helpers behind the prompt editor (docs/sourcework-analysis-design.md §8.1):
// which text it starts from and whether a draft differs from live. No Supabase,
// so it is testable on its own.

/** The text the editor opens with: the saved draft, else the live text, else the built-in. */
export function initialPromptText(args: {
  draft: string | null;
  live: string | null;
  builtIn: string;
}): string {
  return args.draft ?? args.live ?? args.builtIn;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Whether the draft says something other than the live text (line endings and outer blanks don't count). */
export function draftDiffersFromLive(draft: string | null, live: string): boolean {
  if (draft === null) return false;
  return normalize(draft) !== normalize(live);
}
