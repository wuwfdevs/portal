import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { readFormatSpec, type FormatSpec } from "./piece-formats";

// Reads behind piece formats (docs/sourcework-analysis-design.md §6.3, §8): the live formats
// Draft with AI offers, and what the Editors page shows for one format. Through the caller's
// session, so RLS is the boundary; a failed read throws.

export interface LiveFormat {
  id: string;
  name: string;
  versionId: string;
  version: number;
  spec: FormatSpec;
}

export interface FormatListEntry {
  id: string;
  name: string;
  liveVersion: number | null;
}

export interface FormatVersionEntry {
  id: string;
  version: number;
  spec: FormatSpec | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  isLive: boolean;
  /** Pieces whose latest draft followed this version. */
  piecesMade: number;
}

export interface FormatEditorData {
  id: string;
  name: string;
  live: { versionId: string; version: number; spec: FormatSpec } | null;
  versions: FormatVersionEntry[];
  draft: { spec: FormatSpec; updatedAt: string } | null;
}

/** The formats a reporter can draft from: those with a published version, in the editors' order. */
export async function listLiveFormats(): Promise<LiveFormat[]> {
  const supabase = await createClient();
  const formats =
    unwrapRead(
      await supabase
        .from("sw_piece_formats")
        .select("id, name, live_version_id, position")
        .not("live_version_id", "is", null)
        .order("position")
        .order("name"),
      "the piece formats",
    ) ?? [];
  if (formats.length === 0) return [];
  const versions =
    unwrapRead(
      await supabase
        .from("sw_piece_format_versions")
        .select("id, version, spec")
        .in(
          "id",
          formats.map((format) => format.live_version_id!),
        ),
      "the piece formats",
    ) ?? [];
  const byId = new Map(versions.map((version) => [version.id, version]));
  return formats.flatMap((format) => {
    const version = byId.get(format.live_version_id!);
    const spec = version ? readFormatSpec(version.spec) : null;
    return version && spec
      ? [
          {
            id: format.id,
            name: format.name,
            versionId: version.id,
            version: version.version,
            spec,
          },
        ]
      : [];
  });
}

export async function getLiveFormat(formatId: string): Promise<LiveFormat | null> {
  const formats = await listLiveFormats();
  return formats.find((format) => format.id === formatId) ?? null;
}

/** Every format, published or not, for the Editors page's list. */
export async function listFormatsForEditors(): Promise<FormatListEntry[]> {
  const supabase = await createClient();
  const formats =
    unwrapRead(
      await supabase
        .from("sw_piece_formats")
        .select("id, name, live_version_id, position")
        .order("position")
        .order("name"),
      "the piece formats",
    ) ?? [];
  const liveIds = formats.flatMap((format) =>
    format.live_version_id ? [format.live_version_id] : [],
  );
  const versions =
    liveIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("sw_piece_format_versions").select("id, version").in("id", liveIds),
          "the piece formats",
        ) ?? []);
  const versionById = new Map(versions.map((version) => [version.id, version.version]));
  return formats.map((format) => ({
    id: format.id,
    name: format.name,
    liveVersion: format.live_version_id ? (versionById.get(format.live_version_id) ?? null) : null,
  }));
}

export async function getFormatEditorData(
  formatId: string,
  userId: string,
): Promise<FormatEditorData | null> {
  const supabase = await createClient();
  const format = unwrapRead(
    await supabase
      .from("sw_piece_formats")
      .select("id, name, live_version_id")
      .eq("id", formatId)
      .maybeSingle(),
    "this piece format",
  );
  if (!format) return null;

  const [versionResult, draftResult] = await Promise.all([
    supabase
      .from("sw_piece_format_versions")
      .select("id, version, spec, note, created_by, created_at")
      .eq("format_id", formatId)
      .order("version", { ascending: false }),
    supabase
      .from("sw_piece_format_drafts")
      .select("spec, updated_at")
      .eq("format_id", formatId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const versions = unwrapRead(versionResult, "this format's history") ?? [];
  const draftRow = unwrapRead(draftResult, "your draft of this format");

  // "6 pieces made": pieces whose latest draft followed each version.
  const counts = new Map<string, number>();
  if (versions.length > 0) {
    const pieces =
      unwrapRead(
        await supabase
          .from("sw_pieces")
          .select("format_version_id")
          .in(
            "format_version_id",
            versions.map((version) => version.id),
          ),
        "the pieces made with this format",
      ) ?? [];
    for (const piece of pieces) {
      if (piece.format_version_id) {
        counts.set(piece.format_version_id, (counts.get(piece.format_version_id) ?? 0) + 1);
      }
    }
  }

  const entries: FormatVersionEntry[] = versions.map((version) => ({
    id: version.id,
    version: version.version,
    spec: readFormatSpec(version.spec),
    note: version.note,
    createdBy: version.created_by,
    createdAt: version.created_at,
    isLive: version.id === format.live_version_id,
    piecesMade: counts.get(version.id) ?? 0,
  }));
  const liveEntry = entries.find((entry) => entry.isLive);
  const draftSpec = draftRow ? readFormatSpec(draftRow.spec) : null;

  return {
    id: format.id,
    name: format.name,
    live:
      liveEntry && liveEntry.spec
        ? { versionId: liveEntry.id, version: liveEntry.version, spec: liveEntry.spec }
        : null,
    versions: entries,
    draft: draftRow && draftSpec ? { spec: draftSpec, updatedAt: draftRow.updated_at } : null,
  };
}

/** The editor's saved draft of a format, as the trial route reads it (never from the request). */
export async function getFormatDraft(formatId: string, userId: string): Promise<FormatSpec | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_piece_format_drafts")
      .select("spec")
      .eq("format_id", formatId)
      .eq("user_id", userId)
      .maybeSingle(),
    "your draft of this format",
  );
  return row ? readFormatSpec(row.spec) : null;
}

/** "Radio wrap" and its version, for a piece that records the format version that drafted it. */
export async function describeFormatVersions(
  versionIds: readonly string[],
): Promise<Map<string, { name: string; version: number; formatId: string }>> {
  const result = new Map<string, { name: string; version: number; formatId: string }>();
  const ids = [...new Set(versionIds)];
  if (ids.length === 0) return result;
  const supabase = await createClient();
  const versions =
    unwrapRead(
      await supabase
        .from("sw_piece_format_versions")
        .select("id, version, format_id")
        .in("id", ids),
      "the formats these pieces were drafted from",
    ) ?? [];
  if (versions.length === 0) return result;
  const formats =
    unwrapRead(
      await supabase
        .from("sw_piece_formats")
        .select("id, name")
        .in("id", [...new Set(versions.map((version) => version.format_id))]),
      "the formats these pieces were drafted from",
    ) ?? [];
  const nameById = new Map(formats.map((format) => [format.id, format.name]));
  for (const version of versions) {
    result.set(version.id, {
      name: nameById.get(version.format_id) ?? "A format",
      version: version.version,
      formatId: version.format_id,
    });
  }
  return result;
}

// "Try this draft" ------------------------------------------------------------------------------

export interface FormatTrialSample {
  id: string;
  title: string;
  excerptCount: number;
}

/** Projects a format can be tried on: those with at least one excerpt, most recently active first. */
export async function listFormatTrialSamples(): Promise<FormatTrialSample[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_project_overview")
        .select("id, title, excerpt_count")
        .gt("excerpt_count", 0)
        .order("last_activity", { ascending: false })
        .limit(100),
      "the projects to try on",
    ) ?? [];
  return rows.map((row) => ({ id: row.id, title: row.title, excerptCount: row.excerpt_count }));
}

export interface FormatTrialRecord {
  id: string;
  formatId: string;
  projectId: string;
  projectTitle: string;
  direction: string;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  results: unknown;
  createdAt: string;
  finishedAt: string | null;
}

const TRIAL_COLUMNS =
  "id, format_id, project_id, direction, status, error, results, created_at, finished_at";

async function withProjectTitles(
  rows: {
    id: string;
    format_id: string;
    project_id: string;
    direction: string;
    status: "running" | "succeeded" | "failed";
    error: string | null;
    results: unknown;
    created_at: string;
    finished_at: string | null;
  }[],
): Promise<FormatTrialRecord[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const projects =
    unwrapRead(
      await supabase
        .from("tw_projects")
        .select("id, title")
        .in("id", [...new Set(rows.map((row) => row.project_id))]),
      "these trials' projects",
    ) ?? [];
  const titles = new Map(projects.map((project) => [project.id, project.title]));
  return rows.map((row) => ({
    id: row.id,
    formatId: row.format_id,
    projectId: row.project_id,
    projectTitle: titles.get(row.project_id) ?? "Project",
    direction: row.direction,
    status: row.status,
    error: row.error,
    results: row.results,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }));
}

/** The editor's own unexpired trials of one format, newest first. */
export async function listRecentFormatTrials(
  userId: string,
  formatId: string,
): Promise<FormatTrialRecord[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("sw_piece_format_trials")
        .select(TRIAL_COLUMNS)
        .eq("created_by", userId)
        .eq("format_id", formatId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(10),
      "your recent trials",
    ) ?? [];
  return withProjectTitles(rows);
}

export async function getFormatTrial(
  trialId: string,
  userId: string,
  formatId: string,
): Promise<FormatTrialRecord | null> {
  const supabase = await createClient();
  const row = unwrapRead(
    await supabase
      .from("sw_piece_format_trials")
      .select(TRIAL_COLUMNS)
      .eq("id", trialId)
      .eq("created_by", userId)
      .eq("format_id", formatId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    "this trial",
  );
  if (!row) return null;
  const [record] = await withProjectTitles([row]);
  return record ?? null;
}
