// A project's synthesis (docs/sourcework-analysis-design.md §21): what its accepted findings, taken
// together, establish about each research question. Pure: no Supabase, no model.
//
// The synthesis is a document, not a table of rows. It is stored as insert-only versions of one JSON
// body, the shape pieces use, and this file is the only interpretation of that body. Every statement
// cites accepted findings by id, so a reader can open the passage behind it; a statement a person wrote
// or edited is `pinned` (origin "person") and every later model version carries it forward untouched.

export const CERTAINTIES = ["established", "contested", "uncertain"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  established: "Established",
  contested: "Contested",
  uncertain: "Uncertain",
};

export type SynthesisOrigin = "model" | "person";

export const STATEMENT_MAX = 600;
export const GAP_MAX = 400;
export const NOTE_MAX = 500;
export const SIDE_LABEL_MAX = 160;
/** Ceilings, not targets: the prompt asks for few, and these are what code will keep. */
export const MAX_FINDINGS_PER_SECTION = 12;
export const MAX_GAPS_PER_SECTION = 6;
export const MAX_TENSIONS = 10;
export const MAX_NARRATIVE = 8;
/** Themes the model may offer that no question asked for: few on purpose, or they become noise. */
export const MAX_EMERGING = 5;
export const THEME_LABEL_MAX = 80;

export interface SynthesisFinding {
  id: string;
  statement: string;
  certainty: Certainty;
  /** Accepted data point ids this rests on. */
  cites: string[];
  origin: SynthesisOrigin;
}

export interface SynthesisGap {
  id: string;
  text: string;
  origin: SynthesisOrigin;
  /** The research question made from this gap, once someone tracked it. */
  questionId?: string;
}

export interface SynthesisSection {
  /** The research question this answers; null for findings that answer none. */
  questionId: string | null;
  findings: SynthesisFinding[];
  gaps: SynthesisGap[];
}

export interface TensionSide {
  label: string;
  cites: string[];
}

export interface SynthesisTension {
  id: string;
  statement: string;
  /** Two or more opposing positions, each with the findings behind it. */
  sides: TensionSide[];
  origin: SynthesisOrigin;
}

/** A place in a source the model found with its tools. Times come from the tool's result, never from the model. */
export interface PassageRef {
  sourceId: string;
  startMs: number | null;
  endMs: number | null;
  page: number | null;
}

export interface NarrativeNote {
  id: string;
  /** What the passage holds, in a sentence. */
  note: string;
  passages: PassageRef[];
  origin: SynthesisOrigin;
}

/**
 * A pattern across sources that no research question asked about: several people, in separate sources,
 * describing the same thing. It is a lead for the reporter, not an answer: it can be turned into a
 * research question, which is how the next Analyze starts listening for it.
 */
export interface EmergingTheme {
  id: string;
  /** A few words naming it. */
  label: string;
  /** What the sources share, in a sentence or two. */
  statement: string;
  /** Accepted data point ids it rests on. */
  cites: string[];
  /** Places in the recordings the model found with its tools, for what no finding yet covers. */
  passages: PassageRef[];
  origin: SynthesisOrigin;
  /**
   * What a person decided about it. Only a person sets this, which makes the theme theirs (origin
   * "person"), so every later run carries it as it is and never offers it a second time.
   */
  status?: ThemeStatus;
  /** The research question made from it, when it is being tracked. */
  questionId?: string;
}

export type ThemeStatus = "tracking" | "dismissed";

export interface SynthesisBody {
  sections: SynthesisSection[];
  tensions: SynthesisTension[];
  narrative: NarrativeNote[];
  /** Absent in versions written before themes could emerge; read as none. */
  emerging: EmergingTheme[];
}

export function emptySynthesis(): SynthesisBody {
  return { sections: [], tensions: [], narrative: [], emerging: [] };
}

export function isEmptySynthesis(body: SynthesisBody): boolean {
  return (
    body.tensions.length === 0 &&
    body.narrative.length === 0 &&
    body.emerging.length === 0 &&
    body.sections.every((section) => section.findings.length === 0 && section.gaps.length === 0)
  );
}

// Reading a stored body -------------------------------------------------------------------------

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item !== "")
    : [];
}

function origin(value: unknown): SynthesisOrigin {
  return value === "person" ? "person" : "model";
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" || trimmed.length > max ? null : trimmed;
}

function passage(value: unknown): PassageRef | null {
  const row = (value ?? {}) as Record<string, unknown>;
  if (typeof row.sourceId !== "string" || row.sourceId === "") return null;
  const number = (item: unknown): number | null =>
    typeof item === "number" && Number.isFinite(item) ? item : null;
  return {
    sourceId: row.sourceId,
    startMs: number(row.startMs),
    endMs: number(row.endMs),
    page: number(row.page),
  };
}

/**
 * Reads a stored body. A malformed piece is skipped rather than failing the page: a synthesis is a
 * reading aid, and one bad statement should not hide the rest.
 */
export function parseSynthesisBody(value: unknown): SynthesisBody {
  const body = (value ?? {}) as Record<string, unknown>;
  const result = emptySynthesis();

  for (const raw of Array.isArray(body.sections) ? body.sections : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const section: SynthesisSection = {
      questionId: typeof row.questionId === "string" ? row.questionId : null,
      findings: [],
      gaps: [],
    };
    for (const item of Array.isArray(row.findings) ? row.findings : []) {
      const finding = (item ?? {}) as Record<string, unknown>;
      const statement = text(finding.statement, STATEMENT_MAX);
      if (
        !statement ||
        typeof finding.id !== "string" ||
        !(CERTAINTIES as readonly string[]).includes(finding.certainty as string)
      ) {
        continue;
      }
      section.findings.push({
        id: finding.id,
        statement,
        certainty: finding.certainty as Certainty,
        cites: strings(finding.cites),
        origin: origin(finding.origin),
      });
    }
    for (const item of Array.isArray(row.gaps) ? row.gaps : []) {
      const gap = (item ?? {}) as Record<string, unknown>;
      const gapText = text(gap.text, GAP_MAX);
      if (gapText && typeof gap.id === "string") {
        section.gaps.push({
          id: gap.id,
          text: gapText,
          origin: origin(gap.origin),
          ...(typeof gap.questionId === "string" && gap.questionId !== ""
            ? { questionId: gap.questionId }
            : {}),
        });
      }
    }
    result.sections.push(section);
  }

  for (const raw of Array.isArray(body.tensions) ? body.tensions : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const statement = text(row.statement, STATEMENT_MAX);
    const sides: TensionSide[] = [];
    for (const side of Array.isArray(row.sides) ? row.sides : []) {
      const item = (side ?? {}) as Record<string, unknown>;
      const label = text(item.label, SIDE_LABEL_MAX);
      if (label) sides.push({ label, cites: strings(item.cites) });
    }
    if (statement && typeof row.id === "string" && sides.length >= 2) {
      result.tensions.push({ id: row.id, statement, sides, origin: origin(row.origin) });
    }
  }

  for (const raw of Array.isArray(body.narrative) ? body.narrative : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const note = text(row.note, NOTE_MAX);
    const passages = (Array.isArray(row.passages) ? row.passages : [])
      .map(passage)
      .filter((item): item is PassageRef => item !== null);
    if (note && typeof row.id === "string" && passages.length > 0) {
      result.narrative.push({ id: row.id, note, passages, origin: origin(row.origin) });
    }
  }

  for (const raw of Array.isArray(body.emerging) ? body.emerging : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const label = text(row.label, THEME_LABEL_MAX);
    const statement = text(row.statement, STATEMENT_MAX);
    if (label && statement && typeof row.id === "string") {
      result.emerging.push({
        id: row.id,
        label,
        statement,
        cites: strings(row.cites),
        passages: (Array.isArray(row.passages) ? row.passages : [])
          .map(passage)
          .filter((item): item is PassageRef => item !== null),
        origin: origin(row.origin),
        ...(row.status === "tracking" || row.status === "dismissed"
          ? { status: row.status as ThemeStatus }
          : {}),
        ...(typeof row.questionId === "string" && row.questionId !== ""
          ? { questionId: row.questionId }
          : {}),
      });
    }
  }
  return result;
}

// Carrying a person's work forward ---------------------------------------------------------------

/**
 * A new model version never overwrites what a person wrote or edited. Everything in `base` with
 * origin "person" is kept as it was, in its question's section, ahead of the model's own statements;
 * only its citations are trimmed to findings that are still accepted. A pinned statement left with no
 * accepted finding behind it is kept, not dropped: the reader sees that its support is gone and
 * decides (see `unsupportedIds`).
 */
export function carryPinned(
  base: SynthesisBody | null,
  fresh: SynthesisBody,
  acceptedIds: ReadonlySet<string>,
): SynthesisBody {
  if (!base) return fresh;
  const keep = (cites: readonly string[]): string[] => cites.filter((id) => acceptedIds.has(id));

  const sections = new Map<string | null, SynthesisSection>();
  for (const section of fresh.sections) {
    sections.set(section.questionId, {
      questionId: section.questionId,
      findings: [...section.findings],
      gaps: [...section.gaps],
    });
  }
  const sectionFor = (questionId: string | null): SynthesisSection => {
    let section = sections.get(questionId);
    if (!section) {
      section = { questionId, findings: [], gaps: [] };
      sections.set(questionId, section);
    }
    return section;
  };

  // Section order: base order first, so a question keeps its place from one version to the next.
  const order: (string | null)[] = [];
  for (const section of base.sections)
    if (!order.includes(section.questionId)) order.push(section.questionId);
  for (const section of fresh.sections)
    if (!order.includes(section.questionId)) order.push(section.questionId);

  for (const section of base.sections) {
    const pinnedFindings = section.findings
      .filter((finding) => finding.origin === "person")
      .map((finding) => ({ ...finding, cites: keep(finding.cites) }));
    const pinnedGaps = section.gaps.filter((gap) => gap.origin === "person");
    if (pinnedFindings.length === 0 && pinnedGaps.length === 0) continue;
    const target = sectionFor(section.questionId);
    target.findings = [...pinnedFindings, ...target.findings];
    target.gaps = [...pinnedGaps, ...target.gaps];
  }

  return {
    sections: order
      .map((questionId) => sections.get(questionId))
      .filter((section): section is SynthesisSection => section !== undefined),
    tensions: [
      ...base.tensions
        .filter((tension) => tension.origin === "person")
        .map((tension) => ({
          ...tension,
          sides: tension.sides.map((side) => ({ ...side, cites: keep(side.cites) })),
        })),
      ...fresh.tensions,
    ],
    narrative: [...base.narrative.filter((note) => note.origin === "person"), ...fresh.narrative],
    emerging: (() => {
      const carried = base.emerging
        .filter((theme) => theme.origin === "person")
        .map((theme) => ({ ...theme, cites: keep(theme.cites) }));
      // A theme a person already decided on is not offered again under a new id.
      const decided = carried.filter((theme) => theme.status !== undefined);
      return [
        ...carried,
        ...fresh.emerging.filter((theme) => !decided.some((old) => sameTheme(old, theme))),
      ];
    })(),
  };
}

// Themes across versions -------------------------------------------------------------------------

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Share of the smaller set that the two have in common; 0 when either is empty. */
export function overlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const other = new Set(b);
  const shared = new Set(a.filter((id) => other.has(id))).size;
  return shared / Math.min(new Set(a).size, other.size);
}

/**
 * Whether two themes are the same pattern written in two versions. A model run gives every theme a new
 * id, so identity is the label, or findings that mostly overlap.
 */
export function sameTheme(
  a: Pick<EmergingTheme, "label" | "cites">,
  b: Pick<EmergingTheme, "label" | "cites">,
): boolean {
  if (normalizeLabel(a.label) === normalizeLabel(b.label)) return true;
  return overlap(a.cites, b.cites) >= 0.6;
}

/** A theme that rests on passages the model found, with no accepted finding yet behind it. */
export function isPassagesOnly(
  theme: Pick<EmergingTheme, "cites" | "passages">,
  acceptedIds: ReadonlySet<string>,
): boolean {
  return theme.passages.length > 0 && !theme.cites.some((id) => acceptedIds.has(id));
}

/** Themes in `current` that `previous` did not have. With no previous version nothing is new. */
export function newThemeIds(previous: SynthesisBody | null, current: SynthesisBody): Set<string> {
  if (!previous) return new Set();
  return new Set(
    current.emerging
      .filter((theme) => !previous.emerging.some((old) => sameTheme(old, theme)))
      .map((theme) => theme.id),
  );
}

// Reading it -------------------------------------------------------------------------------------

/** Every finding id the synthesis cites. */
export function citedFindingIds(body: SynthesisBody): Set<string> {
  const ids = new Set<string>();
  for (const section of body.sections) {
    for (const finding of section.findings) for (const id of finding.cites) ids.add(id);
  }
  for (const tension of body.tensions) {
    for (const side of tension.sides) for (const id of side.cites) ids.add(id);
  }
  for (const theme of body.emerging) for (const id of theme.cites) ids.add(id);
  return ids;
}

export interface CitedFindingInfo {
  sourceId: string;
  speakerId: string | null;
}

/**
 * How broad the support is: the distinct sources and speakers behind a statement, and how many findings
 * that is. Computed, never stored, so it stays true as findings come and go. A statement resting on one
 * source says so.
 */
export function supportBreadth(
  cites: readonly string[],
  info: ReadonlyMap<string, CitedFindingInfo>,
): { findings: number; sources: number; speakers: number } {
  const sources = new Set<string>();
  const speakers = new Set<string>();
  let findings = 0;
  for (const id of cites) {
    const found = info.get(id);
    if (!found) continue;
    findings += 1;
    sources.add(found.sourceId);
    if (found.speakerId) speakers.add(found.speakerId);
  }
  return { findings, sources: sources.size, speakers: speakers.size };
}

/** Statements (by id) whose citations no longer include any accepted finding. */
export function unsupportedIds(body: SynthesisBody, acceptedIds: ReadonlySet<string>): Set<string> {
  const bare = new Set<string>();
  for (const section of body.sections) {
    for (const finding of section.findings) {
      if (!finding.cites.some((id) => acceptedIds.has(id))) bare.add(finding.id);
    }
  }
  for (const tension of body.tensions) {
    if (!tension.sides.some((side) => side.cites.some((id) => acceptedIds.has(id)))) {
      bare.add(tension.id);
    }
  }
  for (const theme of body.emerging) {
    if (theme.passages.length === 0 && !theme.cites.some((id) => acceptedIds.has(id))) {
      bare.add(theme.id);
    }
  }
  return bare;
}

/**
 * How many accepted findings changed after a version was written, so the page can say "3 findings have
 * changed since this was written". `updatedAt` is every accepted finding's last change.
 */
export function findingsChangedSince(
  updatedAt: readonly string[],
  versionCreatedAt: string,
): number {
  const cutoff = Date.parse(versionCreatedAt);
  if (Number.isNaN(cutoff)) return 0;
  return updatedAt.filter((value) => Date.parse(value) > cutoff).length;
}
