// The canned directives Branch / Drill down / Evaluate send through the
// discuss pipeline (see actions.ts's performEditorialTurn — every mode runs
// as an ordinary turn so the whole exchange lands in one visible thread).
// They're real stored user messages, because the model needs them as
// conversational context on later turns — but a reporter shouldn't see their
// own button click echoed back as a paragraph they apparently typed. This
// module is the one home for the directive strings so the inspector panel
// can recognize a stored message as a directive (by exact body match) and
// render it as a short "you asked for…" line instead of a chat bubble.

export type DirectiveMode = "branch" | "drilldown" | "evaluate";

export const BRANCH_DIRECTIVE =
  "Branch: look for a genuinely different angle here, grounded in what's already established. If the material doesn't support one, say so.";
export const DRILLDOWN_DIRECTIVE =
  "Drill down: find a more specific, still-unresolved question beneath this one that moves it toward reportability. If there isn't one yet, say so.";
export const EVALUATE_DIRECTIVE =
  "Evaluate this as a candidate story question: is it well-formed and reportable, and separately, would answering it likely make a strong WUWF story given our current editorial priorities?";

export const DIRECTIVE_LABELS: Record<DirectiveMode, string> = {
  branch: "You asked for another angle",
  drilldown: "You asked for a drill-down",
  evaluate: "You asked for an evaluation",
};

const DIRECTIVE_BODIES: Record<DirectiveMode, string> = {
  branch: BRANCH_DIRECTIVE,
  drilldown: DRILLDOWN_DIRECTIVE,
  evaluate: EVALUATE_DIRECTIVE,
};

export function directiveForBody(body: string): DirectiveMode | null {
  for (const mode of Object.keys(DIRECTIVE_BODIES) as DirectiveMode[]) {
    if (DIRECTIVE_BODIES[mode] === body) return mode;
  }
  return null;
}
