import type { SwSourceKind } from "@/lib/database.types";

export interface DeletionSource {
  id: string;
  title: string;
  kind: SwSourceKind;
  /** Excerpts cut from this source. */
  excerptCount: number;
  /** Another project also references it, so deleting this project leaves it in the library. */
  usedElsewhere: boolean;
}

export interface DeletionPlan {
  /** Sources that go with the project: nothing else uses them. */
  removed: DeletionSource[];
  /** Sources that stay in the library because another project uses them. */
  kept: DeletionSource[];
  removedExcerpts: number;
}

/**
 * What deleting a project does to its sources, stated before it happens: a
 * source only this project uses is removed with its transcript and excerpts,
 * and one another project also uses stays in the library. Mirrors the rule
 * `deleteProject` applies, so the warning and the action can't disagree.
 */
export function describeProjectDeletion(sources: DeletionSource[]): DeletionPlan {
  const removed = sources.filter((source) => !source.usedElsewhere);
  return {
    removed,
    kept: sources.filter((source) => source.usedElsewhere),
    removedExcerpts: removed.reduce((sum, source) => sum + source.excerptCount, 0),
  };
}

/** The first few names, and how many more there are — a 30-source warning has to stay readable. */
export function previewList<T>(items: T[], limit = 5): { shown: T[]; more: number } {
  return { shown: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

/** "Delete project and 3 sources" / "Delete project" — the confirm button says exactly how much goes. */
export function deletionConfirmLabel(plan: DeletionPlan): string {
  const count = plan.removed.length;
  if (count === 0) return "Delete project";
  return `Delete project and ${count} source${count === 1 ? "" : "s"}`;
}
