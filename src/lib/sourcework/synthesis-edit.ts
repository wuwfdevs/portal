// A person's changes to a synthesis body, as pure functions: track a pattern or a gap as a research
// question, dismiss a pattern, bring it back. Each returns the new body, or null when there is nothing
// to change, and marks what it touches as the person's (origin "person"), so every later model version
// carries it forward as it is (see `carryPinned`). No Supabase: the action saves the result as a new
// version.

import { QUESTION_MAX } from "./research";
import type { SynthesisBody } from "./synthesis";

export function themeQuestionText(label: string): string {
  const topic = label.replace(/[.?!]+$/, "").toLowerCase();
  return `What do the sources say about ${topic}?`.slice(0, QUESTION_MAX);
}

export function gapQuestionText(gap: string): string {
  const topic = gap.replace(/[.?!]+$/, "");
  return `What do the sources say about this open point: ${topic}?`.slice(0, QUESTION_MAX);
}

export function trackTheme(
  body: SynthesisBody,
  themeId: string,
  questionId: string,
): SynthesisBody | null {
  const theme = body.emerging.find((item) => item.id === themeId);
  if (!theme || theme.status === "tracking") return null;
  return {
    ...body,
    emerging: body.emerging.map((item) =>
      item.id === themeId ? { ...item, origin: "person", status: "tracking", questionId } : item,
    ),
  };
}

export function dismissTheme(body: SynthesisBody, themeId: string): SynthesisBody | null {
  const theme = body.emerging.find((item) => item.id === themeId);
  if (!theme || theme.status === "dismissed") return null;
  return {
    ...body,
    emerging: body.emerging.map((item) =>
      item.id === themeId
        ? { ...item, origin: "person", status: "dismissed", questionId: undefined }
        : item,
    ),
  };
}

/** A dismissed theme goes back to being the model's, so a later run may rewrite or drop it. */
export function restoreTheme(body: SynthesisBody, themeId: string): SynthesisBody | null {
  const theme = body.emerging.find((item) => item.id === themeId);
  if (!theme || theme.status !== "dismissed") return null;
  return {
    ...body,
    emerging: body.emerging.map((item) => {
      if (item.id !== themeId) return item;
      const restored = { ...item, origin: "model" as const };
      delete restored.status;
      delete restored.questionId;
      return restored;
    }),
  };
}

export function trackGap(
  body: SynthesisBody,
  gapId: string,
  questionId: string,
): SynthesisBody | null {
  let found = false;
  const sections = body.sections.map((section) => ({
    ...section,
    gaps: section.gaps.map((gap) => {
      if (gap.id !== gapId || gap.questionId) return gap;
      found = true;
      return { ...gap, origin: "person" as const, questionId };
    }),
  }));
  return found ? { ...body, sections } : null;
}
