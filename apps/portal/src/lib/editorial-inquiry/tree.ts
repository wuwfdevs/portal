// Pure tree logic for Editorial Inquiry — no React, no Supabase, so this runs
// under Vitest without mocking anything. Ported from the interaction logic in
// the concept mockup ("WUWF Inquiry Canvas Concepts.dc.html"): the from-
// scratch tree-layout pass (position each node by depth × column width,
// vertically centered under its children), ancestry walking, and the
// reject/promote depth rules the migration also enforces as check
// constraints (kept here too so the UI can disable an action before a write
// round-trips and fails).

export type QuestionStatus = "active" | "rejected" | "promoted";
export type ContextNoteKind = "note" | "link" | "excerpt";

/**
 * Why a question isn't a strong story question — see
 * docs/editorial-inquiry-design.md §5. unverified_premise is the direct
 * successor of milestone 1's boolean has_assumption flag.
 * too_narrow_process_step is the one reason that runs the opposite
 * direction from the rest: drilled past story level into a reporting task
 * (a records request, a yes/no verification) — the fix is stepping back up,
 * never narrowing further.
 */
export const DIAGNOSIS_KINDS = [
  "still_thematic",
  "too_broad",
  "compound_question",
  "unverified_premise",
  "already_known",
  "unclear_stakes",
  "no_uncertainty",
  "implausible_reporting_path",
  "trivial",
  "descriptive_not_investigative",
  "too_narrow_process_step",
] as const;
export type DiagnosisKind = (typeof DIAGNOSIS_KINDS)[number];

const DIAGNOSIS_LABELS: Record<DiagnosisKind, string> = {
  still_thematic: "Still thematic, not yet investigable",
  too_broad: "Too broad",
  compound_question: "Actually two or three questions",
  unverified_premise: "Assumes an unverified premise",
  already_known: "The answer is already substantially known",
  unclear_stakes: "Stakes are unclear",
  no_uncertainty: "No meaningful uncertainty",
  implausible_reporting_path: "Reporting path is implausible",
  trivial: "Specific but trivial",
  descriptive_not_investigative: "Would produce description, not discovery",
  too_narrow_process_step: "A reporting step, not a story question",
};

export function labelForDiagnosis(kind: DiagnosisKind): string {
  return DIAGNOSIS_LABELS[kind];
}

/**
 * Epistemic weight of a context note, orthogonal to its kind (note/link/
 * excerpt, which describes form). See design doc §4 — never let a hunch
 * silently read as an established fact.
 */
export const EVIDENTIARY_STATUSES = [
  "hunch",
  "source_claim",
  "established_fact",
  "web_finding",
  "inference",
  "open_question",
] as const;
export type EvidentiaryStatus = (typeof EVIDENTIARY_STATUSES)[number];

const EVIDENTIARY_STATUS_LABELS: Record<EvidentiaryStatus, string> = {
  hunch: "Hunch",
  source_claim: "Source claim",
  established_fact: "Established fact",
  web_finding: "Web finding",
  inference: "Inference",
  open_question: "Open question",
};

export function labelForEvidentiaryStatus(status: EvidentiaryStatus): string {
  return EVIDENTIARY_STATUS_LABELS[status];
}

export interface QuestionRecord {
  id: string;
  inquiryId: string;
  parentId: string | null;
  depth: number;
  text: string;
  status: QuestionStatus;
  diagnosisKind: DiagnosisKind | null;
  diagnosisNote: string | null;
  reframedFromText: string | null;
  manualDx: number | null;
  manualDy: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContextNoteRecord {
  id: string;
  questionId: string;
  kind: ContextNoteKind;
  body: string;
  evidentiaryStatus: EvidentiaryStatus;
  sourceTitle: string | null;
  sourceUrl: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** Depth 0 is the root guiding question; depth 1 is a "line of inquiry." */
export function labelForDepth(depth: number): string {
  if (depth === 0) return "Guiding question";
  if (depth === 1) return "Line of inquiry";
  return "Question";
}

/**
 * The only structural rule left for either status: the root (the guiding
 * question itself) can never be rejected or promoted. Whether a question is
 * actually *ready* is an editorial judgment (the model's Evaluate output, and
 * ultimately the reporter's), not a depth gate — milestone 1's "depth >= 2 to
 * promote" rule mistook "has been drilled down enough times" for "is a good
 * question." See design doc §5, §8.
 */
function canChangeStatus(question: Pick<QuestionRecord, "depth" | "status">): boolean {
  return question.depth >= 1 && question.status === "active";
}

export function canPromote(question: Pick<QuestionRecord, "depth" | "status">): boolean {
  return canChangeStatus(question);
}

export function canReject(question: Pick<QuestionRecord, "depth" | "status">): boolean {
  return canChangeStatus(question);
}

/**
 * Drill down always makes sense on an active question, including the root —
 * it's how an inquiry gets its lines of inquiry, and how a parent grows
 * additional distinct children (the tree's only growth action since Branch
 * was consolidated into it — design doc §15). Discuss and Evaluate are
 * deliberately unrestricted — a promoted question can still warrant a
 * follow-up conversation or a second look. A rejected question is moot here
 * regardless, since visibleQuestions() already keeps it off the canvas.
 */
export function canDrillDown(question: Pick<QuestionRecord, "status">): boolean {
  return question.status === "active";
}

/**
 * Ids from `id` up to (and including) the root, nearest-first. Used both for
 * "which edges are on the selected node's path" and for resolving inherited
 * context notes down a branch.
 */
export function ancestryPath(questions: QuestionRecord[], id: string | null): string[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const path: string[] = [];
  let current = id ? byId.get(id) : undefined;
  while (current) {
    path.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Ids of every descendant of `id` (not including `id` itself). */
export function descendantIds(questions: QuestionRecord[], id: string): Set<string> {
  const childrenByParent = new Map<string, QuestionRecord[]>();
  for (const q of questions) {
    if (!q.parentId) continue;
    const siblings = childrenByParent.get(q.parentId) ?? [];
    siblings.push(q);
    childrenByParent.set(q.parentId, siblings);
  }
  const result = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

/**
 * A rejected question and everything under it "disappear from view" per the
 * product brief — the rows stay in the database, but the canvas never lays
 * them out. Matches the mockup's own computeLayout: `hidden` includes the
 * rejected node's own id, not only its descendants.
 */
export function visibleQuestions(questions: QuestionRecord[]): QuestionRecord[] {
  const hidden = new Set<string>();
  for (const q of questions) {
    if (q.status === "rejected") {
      hidden.add(q.id);
      for (const id of descendantIds(questions, q.id)) hidden.add(id);
    }
  }
  return questions.filter((q) => !hidden.has(q.id));
}

/**
 * All children of a node, for a generation prompt's do-not-duplicate list —
 * rejected ones included: a rejected angle is a dead one the reporter
 * already turned down, which the model should know not to re-propose, not
 * an opening it's free to fill again.
 */
export function childrenOf(questions: QuestionRecord[], parentId: string): QuestionRecord[] {
  return questions.filter((q) => q.parentId === parentId);
}

const COLUMN_WIDTH = 340;
const NODE_WIDTH = 240;
const ROW_GAP = 36;
const CHARS_PER_LINE = 32;

/** Rough card height from wrapped text length, matching the mockup's own estimate. */
export function estimateNodeHeight(
  question: Pick<QuestionRecord, "text" | "depth" | "status">,
): number {
  const lines = Math.max(1, Math.ceil(question.text.length / CHARS_PER_LINE));
  let height = 24 + lines * 19 + 24;
  if (question.depth <= 1 || question.status === "rejected" || question.status === "promoted") {
    height += 22; // room for the status/level badge
  }
  return Math.max(92, height);
}

export interface LaidOutQuestion extends QuestionRecord {
  x: number;
  y: number;
  height: number;
  hasChildren: boolean;
}

export interface LaidOutEdge {
  id: string;
  parentId: string;
  childId: string;
  d: string;
}

export interface TreeLayout {
  nodes: LaidOutQuestion[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

/**
 * Positions every visible question: depth becomes a column, a parent is
 * vertically centered over the midpoint of its children's centers, and a
 * leaf just stacks under its previous sibling. `manualDx/manualDy` (a
 * reporter's own drag, persisted per question) offset the computed position
 * rather than replacing it, so nudging one node doesn't disturb its
 * neighbors' layout math.
 */
export function computeTreeLayout(questions: QuestionRecord[]): TreeLayout {
  const visible = visibleQuestions(questions);
  const byId = new Map(visible.map((q) => [q.id, q]));
  const childrenByParent = new Map<string, QuestionRecord[]>();
  for (const q of visible) {
    if (!q.parentId || !byId.has(q.parentId)) continue;
    const siblings = childrenByParent.get(q.parentId) ?? [];
    siblings.push(q);
    childrenByParent.set(q.parentId, siblings);
  }

  const heights = new Map(visible.map((q) => [q.id, estimateNodeHeight(q)]));
  const topY = new Map<string, number>();
  let cursorY = 0;

  const assign = (question: QuestionRecord) => {
    const children = childrenByParent.get(question.id) ?? [];
    if (children.length === 0) {
      topY.set(question.id, cursorY);
      cursorY += (heights.get(question.id) ?? 92) + ROW_GAP;
      return;
    }
    children.forEach(assign);
    const centers = children.map((c) => (topY.get(c.id) ?? 0) + (heights.get(c.id) ?? 92) / 2);
    const avgCenter = (Math.min(...centers) + Math.max(...centers)) / 2;
    topY.set(question.id, avgCenter - (heights.get(question.id) ?? 92) / 2);
  };

  const root = visible.find((q) => q.depth === 0);
  if (root) assign(root);

  const nodes: LaidOutQuestion[] = visible.map((q) => ({
    ...q,
    x: q.depth * COLUMN_WIDTH + (q.manualDx ?? 0),
    y: (topY.get(q.id) ?? 0) + (q.manualDy ?? 0),
    height: heights.get(q.id) ?? 92,
    hasChildren: (childrenByParent.get(q.id) ?? []).length > 0,
  }));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  const edges: LaidOutEdge[] = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = nodesById.get(node.parentId);
    if (!parent) continue;
    const x1 = parent.x + NODE_WIDTH;
    const y1 = parent.y + parent.height / 2;
    const x2 = node.x;
    const y2 = node.y + node.height / 2;
    const mx = (x1 + x2) / 2;
    edges.push({
      id: `edge_${node.id}`,
      parentId: parent.id,
      childId: node.id,
      d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
    });
  }

  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  return {
    nodes,
    edges,
    width: (maxDepth + 1) * COLUMN_WIDTH + 260,
    height: Math.max(500, cursorY + 200),
  };
}

/** Context notes visible on `questionId`: its own plus every ancestor's, nearest-first. */
export function inheritedContextNotes(
  questions: QuestionRecord[],
  contextNotes: ContextNoteRecord[],
  questionId: string,
): { note: ContextNoteRecord; inherited: boolean; sourceQuestionId: string }[] {
  const ancestry = ancestryPath(questions, questionId);
  const order = new Map(ancestry.map((id, index) => [id, index]));
  return contextNotes
    .filter((note) => order.has(note.questionId))
    .sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0))
    .map((note) => ({
      note,
      inherited: note.questionId !== questionId,
      sourceQuestionId: note.questionId,
    }));
}

/** Own + inherited note count, for the canvas card's "N notes" cue. */
export function contextNoteCount(
  questions: QuestionRecord[],
  contextNotes: ContextNoteRecord[],
  questionId: string,
): number {
  return inheritedContextNotes(questions, contextNotes, questionId).length;
}
