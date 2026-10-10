import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import { callStructuredModel } from "./extraction-ai";
import { RESEARCH_MODEL } from "./model";
import {
  DIRECTION_MAX,
  DRAFT_FRAMING,
  MAX_DRAFT_EXCERPTS,
  MAX_DRAFT_THEMES,
  MAX_POINTS_PER_THEME,
  buildDraftInput,
  buildDraftOutputSchema,
  parseDraftOutput,
  type DraftExcerptInput,
  type DraftThemeInput,
} from "./piece-draft-prompt";
import { renderFormatGuide, type FormatSpec } from "./piece-formats";
import { getLiveFormat } from "./piece-format-queries";
import { computePieceLength, type PieceBlock } from "./pieces";
import { loadPieceExcerpts, type PieceExcerpt } from "./piece-queries";
import { savePieceBlocks, type SavedVia } from "./piece-writes";
import { finishRun, startRun } from "./research-runs";
import { chunked } from "./research-queries";

// Draft with AI (docs/sourcework-analysis-design.md §6.3): read the reporter's accepted
// material, ask the model for blocks, and — for a real draft — save them as the piece's next
// version. The same read-and-ask step backs "Try this draft" for a format, which writes nothing.

type Client = Awaited<ReturnType<typeof createClient>>;

// Material -------------------------------------------------------------------------------

export interface MaterialTheme {
  id: string;
  title: string;
  status: "accepted" | "suggested";
  sourceCount: number;
  excerptCount: number;
}

export interface MaterialSummary {
  themes: MaterialTheme[];
  /** Temporal excerpts across the project's sources: everything Draft with AI may place. */
  excerptCount: number;
}

async function projectSourceIds(supabase: Client, projectId: string): Promise<string[]> {
  const links =
    unwrapRead(
      await supabase.from("sw_project_sources").select("source_id").eq("project_id", projectId),
      "this project's sources",
    ) ?? [];
  return links.map((link) => link.source_id);
}

async function projectExcerptIds(supabase: Client, sourceIds: string[]): Promise<string[]> {
  if (sourceIds.length === 0) return [];
  const ids: string[] = [];
  for (const chunk of chunked(sourceIds)) {
    for (const row of unwrapRead(
      await supabase
        .from("sw_source_excerpts")
        .select("id")
        .in("source_id", chunk)
        .eq("locator_kind", "temporal")
        .order("created_at", { ascending: false })
        .limit(500),
      "this project's excerpts",
    ) ?? []) {
      ids.push(row.id);
    }
  }
  return ids;
}

/** Live memberships of the given themes: theme → data point → stance. */
async function themeMemberships(
  supabase: Client,
  themeIds: string[],
): Promise<{ theme_id: string; data_point_id: string; stance: "supports" | "complicates" }[]> {
  const rows: { theme_id: string; data_point_id: string; stance: "supports" | "complicates" }[] =
    [];
  for (const chunk of chunked(themeIds)) {
    rows.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_themes")
          .select("theme_id, data_point_id, stance")
          .in("theme_id", chunk)
          .is("removed_at", null),
        "these themes' evidence",
      ) ?? []),
    );
  }
  return rows;
}

async function excerptLinks(
  supabase: Client,
  dataPointIds: string[],
): Promise<{ data_point_id: string; excerpt_id: string }[]> {
  const rows: { data_point_id: string; excerpt_id: string }[] = [];
  for (const chunk of chunked(dataPointIds)) {
    rows.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_point_excerpts")
          .select("data_point_id, excerpt_id")
          .in("data_point_id", chunk),
        "the excerpts behind these themes",
      ) ?? []),
    );
  }
  return rows;
}

/** What the Draft with AI panel lists: the project's live themes, with sources and excerpts behind each. */
export async function loadMaterialSummary(projectId: string): Promise<MaterialSummary> {
  const supabase = await createClient();
  const [themeResult, breadthResult, sourceIds] = await Promise.all([
    supabase
      .from("sw_themes")
      .select("id, title, status, created_at")
      .eq("project_id", projectId)
      .is("merged_into_id", null)
      .in("status", ["accepted", "suggested"])
      .order("created_at")
      .limit(60),
    supabase.from("sw_theme_breadth").select("theme_id, source_count").eq("project_id", projectId),
    projectSourceIds(supabase, projectId),
  ]);
  const themes = unwrapRead(themeResult, "this project's themes") ?? [];
  const breadth = new Map(
    (unwrapRead(breadthResult, "this project's theme numbers") ?? []).map((row) => [
      row.theme_id,
      row.source_count,
    ]),
  );
  const projectExcerpts = new Set(await projectExcerptIds(supabase, sourceIds));

  const memberships = await themeMemberships(
    supabase,
    themes.map((theme) => theme.id),
  );
  const links = await excerptLinks(supabase, [
    ...new Set(memberships.map((row) => row.data_point_id)),
  ]);
  const excerptsByPoint = new Map<string, string[]>();
  for (const link of links) {
    if (!projectExcerpts.has(link.excerpt_id)) continue;
    excerptsByPoint.set(link.data_point_id, [
      ...(excerptsByPoint.get(link.data_point_id) ?? []),
      link.excerpt_id,
    ]);
  }
  const excerptsByTheme = new Map<string, Set<string>>();
  for (const row of memberships) {
    const set = excerptsByTheme.get(row.theme_id) ?? new Set<string>();
    for (const id of excerptsByPoint.get(row.data_point_id) ?? []) set.add(id);
    excerptsByTheme.set(row.theme_id, set);
  }

  return {
    themes: themes
      .map((theme) => ({
        id: theme.id,
        title: theme.title,
        status: theme.status as "accepted" | "suggested",
        sourceCount: breadth.get(theme.id) ?? 0,
        excerptCount: excerptsByTheme.get(theme.id)?.size ?? 0,
      }))
      // Accepted first: they are what is used.
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "accepted" ? -1 : 1)),
    excerptCount: projectExcerpts.size,
  };
}

export interface DraftMaterial {
  projectTitle: string;
  themes: DraftThemeInput[];
  excerpts: DraftExcerptInput[];
  /** The excerpts by id, for computing the draft's length with the screen's own code. */
  excerptRecords: PieceExcerpt[];
}

/**
 * Everything a draft may use: the chosen accepted themes (all accepted ones when `themeIds`
 * is null) with their accepted data points, and the project's excerpts — those that
 * exemplify the chosen themes first. Suggested and rejected themes, and unreviewed or
 * rejected data points, are never sent.
 */
export async function loadDraftMaterial(
  projectId: string,
  themeIds: readonly string[] | null,
): Promise<DraftMaterial> {
  const supabase = await createClient();
  const [projectResult, themeResult, sourceIds] = await Promise.all([
    supabase.from("tw_projects").select("title").eq("id", projectId).maybeSingle(),
    supabase
      .from("sw_themes")
      .select("id, title, definition, created_at")
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .is("merged_into_id", null)
      .order("created_at"),
    projectSourceIds(supabase, projectId),
  ]);
  const project = unwrapRead(projectResult, "this project");
  const allThemes = unwrapRead(themeResult, "this project's themes") ?? [];
  const chosen = new Set(themeIds ?? allThemes.map((theme) => theme.id));
  const themes = allThemes.filter((theme) => chosen.has(theme.id)).slice(0, MAX_DRAFT_THEMES);

  // Evidence: the accepted data points in those themes.
  const memberships = await themeMemberships(
    supabase,
    themes.map((theme) => theme.id),
  );
  const pointIds = [...new Set(memberships.map((row) => row.data_point_id))];
  const points: {
    id: string;
    claim: string;
    speaker_id: string | null;
    source_id: string;
  }[] = [];
  for (const chunk of chunked(pointIds)) {
    points.push(
      ...(unwrapRead(
        await supabase
          .from("sw_data_points")
          .select("id, claim, speaker_id, source_id")
          .in("id", chunk)
          .eq("status", "accepted"),
        "these themes' data points",
      ) ?? []),
    );
  }
  const pointById = new Map(points.map((point) => [point.id, point]));

  const speakerIds = [
    ...new Set(points.flatMap((point) => (point.speaker_id ? [point.speaker_id] : []))),
  ];
  const speakerNames = new Map<string, string>();
  for (const chunk of chunked(speakerIds)) {
    for (const row of unwrapRead(
      await supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .in("id", chunk),
      "the speakers behind these themes",
    ) ?? []) {
      speakerNames.set(row.id, speakerDisplayLabel(row.diarization_label, row.display_name));
    }
  }
  const sourceTitles = new Map<string, string>();
  for (const chunk of chunked(sourceIds)) {
    for (const row of unwrapRead(
      await supabase.from("sw_sources").select("id, title").in("id", chunk),
      "this project's sources",
    ) ?? []) {
      sourceTitles.set(row.id, row.title);
    }
  }

  const themeInputs: DraftThemeInput[] = themes.map((theme, index) => ({
    number: index + 1,
    title: theme.title,
    definition: theme.definition,
    points: memberships
      .filter((row) => row.theme_id === theme.id && pointById.has(row.data_point_id))
      .slice(0, MAX_POINTS_PER_THEME)
      .map((row) => {
        const point = pointById.get(row.data_point_id)!;
        return {
          claim: point.claim,
          stance: row.stance,
          speaker: point.speaker_id ? (speakerNames.get(point.speaker_id) ?? null) : null,
          sourceTitle: sourceTitles.get(point.source_id) ?? "",
        };
      }),
  }));
  const themeNumberById = new Map(themes.map((theme, index) => [theme.id, index + 1]));

  // Excerpts: the chosen themes' first, then the rest of the project's, newest first.
  const links = await excerptLinks(supabase, [...pointById.keys()]);
  const themesByExcerpt = new Map<string, Set<number>>();
  for (const link of links) {
    for (const row of memberships) {
      if (row.data_point_id !== link.data_point_id) continue;
      const number = themeNumberById.get(row.theme_id);
      if (!number) continue;
      const set = themesByExcerpt.get(link.excerpt_id) ?? new Set<number>();
      set.add(number);
      themesByExcerpt.set(link.excerpt_id, set);
    }
  }
  const allExcerptIds = await projectExcerptIds(supabase, sourceIds);
  const projectSet = new Set(allExcerptIds);
  const ordered = [
    ...[...themesByExcerpt.keys()].filter((id) => projectSet.has(id)),
    ...allExcerptIds.filter((id) => !themesByExcerpt.has(id)),
  ].slice(0, MAX_DRAFT_EXCERPTS);
  const records = await loadPieceExcerpts(supabase, ordered);
  const recordById = new Map(records.map((record) => [record.id, record]));

  const excerpts: DraftExcerptInput[] = [];
  for (const id of ordered) {
    const record = recordById.get(id);
    if (!record) continue;
    excerpts.push({
      number: excerpts.length + 1,
      id: record.id,
      title: record.title,
      speaker: record.speaker,
      sourceTitle: record.sourceTitle,
      seconds: Math.max(0, Math.round((record.endMs - record.startMs) / 1000)),
      words: record.text,
      themeNumbers: [...(themesByExcerpt.get(id) ?? [])].sort((a, b) => a - b),
    });
  }

  return {
    projectTitle: project?.title ?? "Project",
    themes: themeInputs,
    excerpts,
    excerptRecords: records,
  };
}

// The model step ---------------------------------------------------------------------------

export type GeneratedDraft =
  | { ok: true; blocks: PieceBlock[]; warnings: string[]; lengthSeconds: number }
  | { ok: false; error: string };

/** One draft from one format. Writes nothing. */
export async function generateDraft(args: {
  material: DraftMaterial;
  formatName: string;
  spec: FormatSpec;
  direction: string;
}): Promise<GeneratedDraft> {
  const answer = await callStructuredModel({
    step: "drafting",
    schemaName: "piece_draft",
    schema: buildDraftOutputSchema(),
    framing: DRAFT_FRAMING,
    guide: renderFormatGuide(args.formatName, args.spec),
    input: buildDraftInput({
      projectTitle: args.material.projectTitle,
      direction: args.direction.slice(0, DIRECTION_MAX),
      targetSeconds: args.spec.targetSeconds,
      themes: args.material.themes,
      excerpts: args.material.excerpts,
    }),
  });
  if (!answer.ok) return answer;
  const parsed = parseDraftOutput(answer.text, args.material.excerpts, () => crypto.randomUUID());
  if (!parsed.ok) return parsed;
  const length = computePieceLength(parsed.blocks, args.material.excerptRecords);
  return {
    ok: true,
    blocks: parsed.blocks,
    warnings: parsed.warnings,
    lengthSeconds: length.totalSeconds,
  };
}

// A real draft --------------------------------------------------------------------------------

export type DraftPieceResult =
  | {
      ok: true;
      version: number;
      lengthSeconds: number;
      formatName: string;
      formatVersion: number;
      targetSeconds: number;
      warnings: string[];
    }
  | { ok: false; error: string; conflict?: boolean };

/**
 * Drafts a piece from a live format and saves it as the piece's next version. From the
 * editor this is only offered on an empty piece (§6.1); the assistant may also use it to
 * start over, on request — the old content stays in History either way.
 */
export async function draftPiece(args: {
  pieceId: string;
  formatId: string;
  themeIds: readonly string[] | null;
  direction: string;
  userId: string;
  savedVia: Extract<SavedVia, "generation">;
  /** When set, refuse unless the piece is still at this version (the editor's empty-piece case). */
  expectVersion?: number;
}): Promise<DraftPieceResult> {
  const supabase = await createClient();
  const piece = unwrapRead(
    await supabase
      .from("sw_pieces")
      .select("id, project_id, current_version, target_seconds")
      .eq("id", args.pieceId)
      .maybeSingle(),
    "this piece",
  );
  if (!piece) return { ok: false, error: "That piece no longer exists." };
  if (args.expectVersion !== undefined && piece.current_version !== args.expectVersion) {
    return {
      ok: false,
      conflict: true,
      error: "This piece changed while you were choosing. Reload to see it.",
    };
  }

  const format = await getLiveFormat(args.formatId);
  if (!format)
    return { ok: false, error: "That format isn't published, so it can't draft a piece." };

  const run = await startRun(supabase, {
    kind: "piece_draft",
    projectId: piece.project_id,
    sourceId: null,
    pieceId: piece.id,
    formatVersionId: format.versionId,
    promptVersionId: null,
    trial: false,
    model: RESEARCH_MODEL,
    userId: args.userId,
  });
  if (!run.ok) return { ok: false, error: run.error };

  try {
    const material = await loadDraftMaterial(piece.project_id, args.themeIds);
    const draft = await generateDraft({
      material,
      formatName: format.name,
      spec: format.spec,
      direction: args.direction,
    });
    if (!draft.ok) {
      await finishRun(supabase, run.runId, { status: "failed", error: draft.error });
      return draft;
    }

    const saved = await savePieceBlocks(
      supabase,
      piece.id,
      piece.current_version,
      draft.blocks,
      args.savedVia,
    );
    if (!saved.ok) {
      const error =
        "conflict" in saved
          ? "Someone saved this piece while the draft was being written."
          : saved.error;
      await finishRun(supabase, run.runId, { status: "failed", error });
      return { ok: false, error, conflict: "conflict" in saved };
    }

    const updated = await supabase
      .from("sw_pieces")
      .update({
        format_version_id: format.versionId,
        drafted_version: saved.version,
        // A piece with no target takes the format's (§6.1); one the writer set is kept.
        ...(piece.target_seconds === null ? { target_seconds: format.spec.targetSeconds } : {}),
      })
      .eq("id", piece.id);
    if (updated.error)
      console.error("Could not record the format that drafted a piece:", updated.error);

    await finishRun(supabase, run.runId, {
      status: "succeeded",
      counts: {
        blocks: draft.blocks.length,
        actualities: draft.blocks.filter((block) => block.type === "actuality").length,
        length_seconds: saved.lengthSeconds,
        dropped: draft.warnings.length,
      },
    });
    return {
      ok: true,
      version: saved.version,
      lengthSeconds: saved.lengthSeconds,
      formatName: format.name,
      formatVersion: format.version,
      targetSeconds: piece.target_seconds ?? format.spec.targetSeconds,
      warnings: draft.warnings,
    };
  } catch (error) {
    console.error("Sourcework draft failed:", error);
    const message = error instanceof Error ? error.message : "The draft failed.";
    await finishRun(supabase, run.runId, { status: "failed", error: message });
    return { ok: false, error: message };
  }
}
