// The screens a tool guide can document, keyed the way rc_articles.screen_keys
// stores them ("<tool>.<screen>"). Slice 1 only needs the names, for a guide's
// meta line; slice 3 adds screenKeyForPath() for the in-tool Help panel.
// Pure — colocated test.

const SCREEN_NAMES: Record<string, string> = {
  "sourcework.projects": "Projects",
  "sourcework.project": "Project workspace",
  "sourcework.sources": "Source Library",
  "sourcework.source": "Source detail",
  "roadmap.board": "Roadmap",
  "roadmap.post": "Request",
  "log.clock": "Clock template",
  "log.program": "Program",
  "log.program.schedule": "Schedule a program",
  "underwriting.contracts": "Contracts",
};

/** A screen key's display name, or null for a key this list doesn't know. */
export function screenName(key: string): string | null {
  return SCREEN_NAMES[key] ?? null;
}

/** The name of the first screen a guide documents that has one. */
export function primaryScreenName(keys: readonly string[]): string | null {
  for (const key of keys) {
    const name = screenName(key);
    if (name) return name;
  }
  return null;
}
