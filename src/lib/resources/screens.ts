// The screens a tool guide can document, keyed the way rc_articles.screen_keys
// stores them ("<screen area>.<screen>"), each tagged with the tool it belongs
// to and the routes it covers. The guide form offers a tool's screens as
// checkboxes; a guide's meta line shows the first one's name; and the in-tool
// Help panel maps the current URL to a tool and screen with
// helpContextForPath(). Pure — colocated test.

export interface ScreenDefinition {
  key: string;
  name: string;
  /** tools.key — not always the key's own prefix (Sourcework's tool key is "transcription"). */
  toolKey: string;
  /**
   * Route patterns this screen covers: literal segments, `:param` for one
   * dynamic segment, and an optional `?name=value` a query must carry.
   */
  paths: string[];
}

export const SCREENS: readonly ScreenDefinition[] = [
  {
    key: "editorial.backlog",
    name: "Pitch backlog",
    toolKey: "editorial-planning",
    paths: ["/editorial"],
  },
  {
    key: "editorial.pitch",
    name: "Pitch",
    toolKey: "editorial-planning",
    paths: [
      "/editorial/pitches/new",
      "/editorial/pitches/:id",
      "/editorial/pitches/:id/edit",
      "/editorial/pitches/:id/story-plan",
    ],
  },
  {
    key: "editorial.meeting",
    name: "Meeting",
    toolKey: "editorial-planning",
    paths: ["/editorial/meetings", "/editorial/meetings/:id"],
  },
  {
    key: "editorial.settings",
    name: "Settings",
    toolKey: "editorial-planning",
    paths: [
      "/editorial/settings",
      "/editorial/settings/form",
      "/editorial/settings/form/:id/edit",
      "/editorial/settings/pillars",
      "/editorial/settings/pillars/:id/edit",
      "/editorial/settings/rubric",
      "/editorial/settings/rubric/:id/edit",
    ],
  },
  {
    key: "sourcework.projects",
    name: "Projects",
    toolKey: "transcription",
    paths: ["/sourcework", "/sourcework/new"],
  },
  {
    key: "sourcework.project",
    name: "Project workspace",
    toolKey: "transcription",
    paths: ["/sourcework/:id"],
  },
  {
    key: "sourcework.sources",
    name: "Source Library",
    toolKey: "transcription",
    paths: ["/sourcework?tab=sources"],
  },
  {
    key: "sourcework.source",
    name: "Source detail",
    toolKey: "transcription",
    paths: ["/sourcework/sources/:id"],
  },
  {
    key: "remote-interview.sessions",
    name: "Sessions",
    toolKey: "remote-interview",
    paths: ["/remote-interview", "/remote-interview/new"],
  },
  {
    key: "remote-interview.session",
    name: "Session",
    toolKey: "remote-interview",
    paths: ["/remote-interview/:id"],
  },
  {
    key: "remote-interview.studio",
    name: "Studio",
    toolKey: "remote-interview",
    paths: ["/remote-interview/:id/studio"],
  },
  {
    key: "audience-listening.queries",
    name: "Queries",
    toolKey: "audience-listening",
    paths: ["/audience-listening", "/audience-listening/new"],
  },
  {
    key: "audience-listening.query",
    name: "Query",
    toolKey: "audience-listening",
    paths: [
      "/audience-listening/:id",
      "/audience-listening/:id/preview",
      "/audience-listening/:id/submissions/:submissionId",
    ],
  },
  {
    key: "roadmap.board",
    name: "Roadmap",
    toolKey: "roadmap",
    paths: ["/roadmap", "/roadmap/new"],
  },
  {
    key: "roadmap.post",
    name: "Request",
    toolKey: "roadmap",
    paths: ["/roadmap/:id", "/roadmap/:id/edit"],
  },
  {
    key: "academic-partnerships.pipeline",
    name: "Pipeline",
    toolKey: "academic-partnerships",
    paths: [
      "/academic-partnerships",
      "/academic-partnerships/all",
      "/academic-partnerships/dashboard",
    ],
  },
  {
    key: "academic-partnerships.submission",
    name: "Submission",
    toolKey: "academic-partnerships",
    paths: ["/academic-partnerships/:id"],
  },
  {
    key: "academic-partnerships.settings",
    name: "Settings",
    toolKey: "academic-partnerships",
    paths: ["/academic-partnerships/settings"],
  },
  { key: "log.today", name: "Today", toolKey: "log", paths: ["/log"] },
  { key: "log.import", name: "Import a program log", toolKey: "log", paths: ["/log/import"] },
  { key: "log.rundown", name: "Rundown", toolKey: "log", paths: ["/log/rundowns/:id"] },
  {
    key: "log.library",
    name: "Content library",
    toolKey: "log",
    paths: ["/log/library", "/log/library/new", "/log/library/import", "/log/library/:id"],
  },
  {
    key: "log.clock",
    name: "Clock template",
    toolKey: "log",
    paths: ["/log/clocks/:id", "/log/clocks/new"],
  },
  {
    key: "log.program",
    name: "Program",
    toolKey: "log",
    paths: ["/log/programs", "/log/programs/:id", "/log/programs/:id/edit"],
  },
  {
    key: "log.program.schedule",
    name: "Schedule a program",
    toolKey: "log",
    paths: ["/log/programs/:id/schedule/new", "/log/programs/:id/schedule/:entryId/edit"],
  },
  {
    key: "log.sources",
    name: "Sources",
    toolKey: "log",
    paths: ["/log/sources", "/log/sources/npr", "/log/sources/weather"],
  },
  {
    key: "underwriting.contracts",
    name: "Contracts",
    toolKey: "underwriting",
    paths: ["/underwriting/contracts", "/underwriting/contracts/new"],
  },
  {
    key: "underwriting.contract",
    name: "Contract",
    toolKey: "underwriting",
    paths: [
      "/underwriting/contracts/:id",
      "/underwriting/contracts/:id/copy",
      "/underwriting/contracts/:id/order",
      "/underwriting/contracts/:id/policy",
      "/underwriting/contracts/:id/schedule",
      "/underwriting/contracts/:id/lines/:lineId/edit",
      "/underwriting/contracts/:id/lines/:lineId/place",
    ],
  },
  {
    key: "underwriting.copy",
    name: "Copy library",
    toolKey: "underwriting",
    paths: [
      "/underwriting/copy",
      "/underwriting/copy/new",
      "/underwriting/copy/:id",
      "/underwriting/copy/:id/edit",
    ],
  },
  {
    key: "editorial-inquiry.canvas",
    name: "Question tree",
    toolKey: "editorial-inquiry",
    paths: ["/editorial-inquiry"],
  },
];

/**
 * The first URL segment of each tool, for pages no screen above names
 * (Underwriting's dashboard, Log's weather) — Help still opens, on the tool's
 * guides, with no screen of its own.
 */
const TOOL_ROUTE_SEGMENTS: Record<string, string> = {
  editorial: "editorial-planning",
  sourcework: "transcription",
  "remote-interview": "remote-interview",
  "audience-listening": "audience-listening",
  roadmap: "roadmap",
  "academic-partnerships": "academic-partnerships",
  log: "log",
  underwriting: "underwriting",
  "editorial-inquiry": "editorial-inquiry",
};

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

function segmentsOf(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * How well a pattern matches, or -1 for no match: literal segments count
 * double and a required query parameter adds one, so `/sourcework/new` beats
 * `/sourcework/:id` and `/sourcework?tab=sources` beats `/sourcework`.
 */
function matchScore(pattern: string, segments: string[], search: URLSearchParams): number {
  const [patternPath = "", patternQuery] = pattern.split("?");
  const expected = segmentsOf(patternPath);
  if (expected.length !== segments.length) return -1;
  let score = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const part = expected[index]!;
    if (part.startsWith(":")) {
      score += 1;
    } else if (part === segments[index]) {
      score += 2;
    } else {
      return -1;
    }
  }
  if (patternQuery) {
    const [name = "", value = ""] = patternQuery.split("=");
    if (search.get(name) !== value) return -1;
    score += 1;
  }
  return score;
}

export interface HelpContext {
  toolKey: string;
  /** Null on a tool page no screen above covers. */
  screenKey: string | null;
}

/**
 * Which tool and screen a portal URL belongs to, for the Help panel — or
 * null outside any tool (the dashboard, Administration, Resources itself),
 * where the Help button doesn't show.
 */
export function helpContextForPath(pathname: string, search = ""): HelpContext | null {
  const segments = segmentsOf(pathname);
  const toolKey = TOOL_ROUTE_SEGMENTS[segments[0] ?? ""];
  if (!toolKey) return null;
  const params = new URLSearchParams(search);

  let best: { key: string; score: number } | null = null;
  for (const screen of SCREENS) {
    if (screen.toolKey !== toolKey) continue;
    for (const pattern of screen.paths) {
      const score = matchScore(pattern, segments, params);
      if (score >= 0 && (!best || score > best.score)) best = { key: screen.key, score };
    }
  }
  return { toolKey, screenKey: best?.key ?? null };
}
