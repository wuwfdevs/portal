import { pluralize } from "@/lib/format";

// Whether a project has what an outline needs (docs/sourcework-analysis-design.md §25). Outline with AI
// builds beats from accepted findings and places accepted excerpts; with no excerpts it can only write
// beats, and with neither it has nothing to work from. Pure, so the editor and the tests share it.

export interface OutlineMaterial {
  /** Excerpts in the project: the clips the outline can place. */
  excerpts: number;
  /** Accepted findings: what the beats are built from. */
  findings: number;
  /** Findings and clips Analyze suggested that nobody has decided on yet. */
  waiting: number;
}

export type OutlineReadiness =
  | { level: "ready" }
  | { level: "no_excerpts"; message: string; canRun: true }
  | { level: "nothing"; message: string; canRun: false };

export function outlineReadiness(material: OutlineMaterial): OutlineReadiness {
  const waiting =
    material.waiting > 0 ? ` ${pluralize(material.waiting, "suggestion")} waiting for review.` : "";
  if (material.findings === 0 && material.excerpts === 0) {
    return {
      level: "nothing",
      canRun: false,
      message: `There are no accepted findings or excerpts yet, so the outline has nothing to work from. Accept some first.${waiting}`,
    };
  }
  if (material.excerpts === 0) {
    return {
      level: "no_excerpts",
      canRun: true,
      message: `No excerpts have been accepted yet. An outline can only place excerpts you have accepted, so this one would be beats with no tape.${waiting} Accept the clips you want first.`,
    };
  }
  return { level: "ready" };
}
