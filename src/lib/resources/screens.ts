// The screens a tool guide can document, keyed the way rc_articles.screen_keys
// stores them ("<screen area>.<screen>"), each tagged with the tool it belongs
// to. The guide form offers a tool's screens as checkboxes; a guide's meta
// line shows the first one's name. Slice 3 adds screenKeyForPath() for the
// in-tool Help panel. Pure — colocated test.

export interface ScreenDefinition {
  key: string;
  name: string;
  /** tools.key — not always the key's own prefix (Sourcework's tool key is "transcription"). */
  toolKey: string;
}

export const SCREENS: readonly ScreenDefinition[] = [
  { key: "editorial.backlog", name: "Pitch backlog", toolKey: "editorial-planning" },
  { key: "editorial.pitch", name: "Pitch", toolKey: "editorial-planning" },
  { key: "editorial.meeting", name: "Meeting", toolKey: "editorial-planning" },
  { key: "editorial.settings", name: "Settings", toolKey: "editorial-planning" },
  { key: "sourcework.projects", name: "Projects", toolKey: "transcription" },
  { key: "sourcework.project", name: "Project workspace", toolKey: "transcription" },
  { key: "sourcework.sources", name: "Source Library", toolKey: "transcription" },
  { key: "sourcework.source", name: "Source detail", toolKey: "transcription" },
  { key: "remote-interview.sessions", name: "Sessions", toolKey: "remote-interview" },
  { key: "remote-interview.session", name: "Session", toolKey: "remote-interview" },
  { key: "remote-interview.studio", name: "Studio", toolKey: "remote-interview" },
  { key: "audience-listening.queries", name: "Queries", toolKey: "audience-listening" },
  { key: "audience-listening.query", name: "Query", toolKey: "audience-listening" },
  { key: "roadmap.board", name: "Roadmap", toolKey: "roadmap" },
  { key: "roadmap.post", name: "Request", toolKey: "roadmap" },
  { key: "academic-partnerships.pipeline", name: "Pipeline", toolKey: "academic-partnerships" },
  {
    key: "academic-partnerships.submission",
    name: "Submission",
    toolKey: "academic-partnerships",
  },
  { key: "log.today", name: "Today", toolKey: "log" },
  { key: "log.rundown", name: "Rundown", toolKey: "log" },
  { key: "log.library", name: "Content library", toolKey: "log" },
  { key: "log.clock", name: "Clock template", toolKey: "log" },
  { key: "log.program", name: "Program", toolKey: "log" },
  { key: "log.program.schedule", name: "Schedule a program", toolKey: "log" },
  { key: "underwriting.contracts", name: "Contracts", toolKey: "underwriting" },
  { key: "underwriting.contract", name: "Contract", toolKey: "underwriting" },
  { key: "underwriting.copy", name: "Copy library", toolKey: "underwriting" },
  { key: "editorial-inquiry.canvas", name: "Question tree", toolKey: "editorial-inquiry" },
];

const BY_KEY = new Map(SCREENS.map((screen) => [screen.key, screen]));

/** A screen key's display name, or null for a key this list doesn't know. */
export function screenName(key: string): string | null {
  return BY_KEY.get(key)?.name ?? null;
}

/** The name of the first screen a guide documents that has one. */
export function primaryScreenName(keys: readonly string[]): string | null {
  for (const key of keys) {
    const name = screenName(key);
    if (name) return name;
  }
  return null;
}

/** The screens a guide for this tool may document. */
export function screensForTool(toolKey: string): ScreenDefinition[] {
  return SCREENS.filter((screen) => screen.toolKey === toolKey);
}
