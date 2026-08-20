import "server-only";
import { listPillars, listCriteria, getDefaultRubricProfile } from "@/lib/editorial/data";
import type { EditorialCriterionContext } from "./ai";

/**
 * Editorial Inquiry's read of Editorial Planning's own configuration —
 * WUWF's guiding questions (ep_pillars) and current editorial criteria
 * (ep_criteria/ep_rubric_profiles). This file exists so there is exactly one
 * place Editorial Inquiry reaches into Editorial Planning's data, rather than
 * scattering `@/lib/editorial/data` imports through queries.ts/ai.ts/
 * actions.ts. See docs/editorial-inquiry-design.md §2 for why Editorial
 * Planning is the source of truth and why this tool doesn't duplicate either
 * concept.
 *
 * `lib/editorial/data.ts`'s functions assert nothing beyond RLS — they're
 * plain RLS-scoped reads, so what comes back depends on the calling user's
 * access. The migration for this revision added a narrow `select` policy on
 * ep_pillars/ep_criteria/ep_rubric_profiles admitting
 * private.has_editorial_inquiry_access alongside Editorial Planning's own
 * ep_has_access, so any Editorial Inquiry member gets real rows here
 * regardless of whether they separately hold an editorial-planning grant.
 */

export interface GuidingQuestionOption {
  pillarId: string;
  name: string;
  guidingQuestion: string;
}

/**
 * Active pillars with a guiding question set — the "start a new inquiry"
 * picker's choices. A pillar with no guiding question yet is omitted rather
 * than letting Editorial Inquiry invent one; see design doc §9/§10.
 */
export async function listGuidingQuestionOptions(): Promise<GuidingQuestionOption[]> {
  const pillars = await listPillars({ activeOnly: true });
  return pillars
    .filter((p): p is typeof p & { guiding_question: string } => !!p.guiding_question?.trim())
    .map((p) => ({ pillarId: p.id, name: p.name, guidingQuestion: p.guiding_question }));
}

/**
 * An active pillar's CURRENT name, for the pitch handoff (design doc §8) —
 * looked up live rather than trusting an inquiry's own snapshot, so it
 * always matches one of Editorial Planning's presently-valid select options
 * even if the pillar was renamed since the inquiry started. Null if the
 * pillar no longer exists or was deactivated; the caller falls back to the
 * inquiry's snapshot name in that case.
 */
export async function getActivePillarName(pillarId: string | null): Promise<string | null> {
  if (!pillarId) return null;
  const pillars = await listPillars({ activeOnly: true });
  return pillars.find((p) => p.id === pillarId)?.name ?? null;
}

/**
 * The default rubric profile's active core criteria, as prose guidance for
 * the reasoning engine — name/description/guidance only. Deliberately never
 * weight, scale, or anchors (those exist to produce a numeric review score in
 * Editorial Planning's own weekly meeting; this tool has no meeting and
 * produces no score — design doc §2, §7) and never a modifier criterion
 * (institutional alignment has no bearing on whether a question is a strong
 * story question to reason about here).
 */
export async function listCurrentCoreCriteria(): Promise<EditorialCriterionContext[]> {
  const profile = await getDefaultRubricProfile();
  if (!profile) return [];
  const criteria = await listCriteria({ activeOnly: true, profileId: profile.id });
  return criteria
    .filter((c) => c.criterion_type === "core")
    .map((c) => ({ name: c.name, description: c.description, guidance: c.guidance }));
}
