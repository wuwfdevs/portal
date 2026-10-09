// Pure helpers behind the prompt editor and "Try this draft" screens
// (docs/sourcework-analysis-design.md §8.1): which text the editor starts from,
// whether a draft differs from live, which projects and sources can be a sample,
// and small display rules. No Supabase, so it is testable on its own.

import { formatDuration } from "@/lib/transcription/media";
import type { TrialFilter } from "./trials";

/** The text the editor opens with: the saved draft, else the live text, else the built-in. */
export function initialPromptText(args: {
  draft: string | null;
  live: string | null;
  builtIn: string;
}): string {
  return args.draft ?? args.live ?? args.builtIn;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Whether the draft says something other than the live text (line endings and outer blanks don't count). */
export function draftDiffersFromLive(draft: string | null, live: string): boolean {
  if (draft === null) return false;
  return normalize(draft) !== normalize(live);
}

export interface SampleSource {
  id: string;
  /** "Tom Reyes, interview · 58:12" */
  label: string;
}

export interface SampleProject {
  id: string;
  title: string;
  sources: SampleSource[];
}

/**
 * Projects that can be a sample: at least one active research question (the
 * project supplies the questions) and at least one ready source. A project's
 * sources are only the ready ones.
 */
export function eligibleSamples(args: {
  projectsWithQuestions: ReadonlySet<string>;
  projects: readonly { id: string; title: string }[];
  links: readonly { projectId: string; sourceId: string }[];
  sources: readonly {
    id: string;
    title: string;
    status: string;
    durationMs: number | null;
  }[];
}): SampleProject[] {
  const readySources = new Map(
    args.sources.filter((source) => source.status === "ready").map((s) => [s.id, s]),
  );
  const byProject = new Map<string, SampleSource[]>();
  for (const link of args.links) {
    const source = readySources.get(link.sourceId);
    if (!source) continue;
    const list = byProject.get(link.projectId) ?? [];
    if (list.some((entry) => entry.id === source.id)) continue;
    list.push({
      id: source.id,
      label: source.durationMs
        ? `${source.title} · ${formatDuration(source.durationMs)}`
        : source.title,
    });
    byProject.set(link.projectId, list);
  }
  return args.projects
    .filter(
      (project) =>
        args.projectsWithQuestions.has(project.id) && (byProject.get(project.id)?.length ?? 0) > 0,
    )
    .map((project) => ({
      id: project.id,
      title: project.title,
      sources: (byProject.get(project.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** A valid project/source pair from the available samples, else the first project's first source, else null. */
export function pickDefaultSample(
  samples: readonly SampleProject[],
  last: { projectId: string; sourceId: string } | null,
): { projectId: string; sourceId: string } | null {
  if (last) {
    const project = samples.find((entry) => entry.id === last.projectId);
    if (project?.sources.some((source) => source.id === last.sourceId)) return last;
  }
  const first = samples[0];
  return first ? { projectId: first.id, sourceId: first.sources[0]!.id } : null;
}

/** "1m 12s", "45s" — how long a trial took. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
}

/** Rows shown before "show all N": the first six unless the reader asked for everything. */
export const TRIAL_ROWS_SHOWN = 6;

export function limitRows<T>(
  rows: readonly T[],
  all: boolean,
  limit = TRIAL_ROWS_SHOWN,
): { shown: T[]; hidden: number } {
  if (all || rows.length <= limit) return { shown: [...rows], hidden: 0 };
  return { shown: rows.slice(0, limit), hidden: rows.length - limit };
}

export function parseTrialShow(raw: string | undefined): TrialFilter {
  return raw === "draft_only" || raw === "live_only" || raw === "both" ? raw : "all";
}

/** The title over the compare: against a version, or against the built-in text. */
export function trialHeading(liveVersion: number | null): string {
  return liveVersion === null
    ? "Draft compared with the built-in text"
    : `Draft compared with live v${liveVersion}`;
}
