import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";
import { readPage } from "@/lib/pagination-read";
import { pageRange } from "@/lib/pagination";
import { anyWordQuery, articleHref } from "./articles";
import { embedSearchQuery } from "./embeddings";

export { articleHref };

/**
 * Data access for Resources. Every read goes through the RLS-scoped server
 * client, so rc_articles' select policy (audience plus tool access) decides
 * what comes back — these functions add shape, not authorization. Reads are
 * unwrapped rather than defaulted to `[]`, per CLAUDE.md.
 */

export type RcArticle = Database["public"]["Tables"]["rc_articles"]["Row"];
export type RcArticleVersion = Database["public"]["Tables"]["rc_article_versions"]["Row"];

type ArticleRow = Omit<RcArticle, "search_vector" | "content_hash">;

const ARTICLE_COLUMNS =
  "id, slug, kind, title, summary, body, area, owner_role, tool_id, screen_keys, released_on, sort_order, source, version_note, needs_review, edited_since_release, version, created_at, updated_at, updated_by";

export interface ToolRef {
  id: string;
  key: string;
  name: string;
}

export interface GuideLink {
  slug: string;
  title: string;
  toolKey: string;
}

export interface ReleaseNote extends ArticleRow {
  tool: ToolRef | null;
  guides: GuideLink[];
}

export interface ToolGuideSummary {
  tool: ToolRef;
  count: number;
  lastUpdated: string;
  firstSlug: string;
  /** Every guide for the tool, in list order. */
  guides: { slug: string; title: string }[];
}

export interface SearchHit {
  article: ArticleRow;
  tool: ToolRef | null;
}

async function toolsById(): Promise<Map<string, ToolRef>> {
  const supabase = await createClient();
  const tools = unwrapRead(await supabase.from("tools").select("id, key, name"), "tools");
  return new Map((tools ?? []).map((tool) => [tool.id, tool]));
}

/**
 * One page of the procedures the viewer can read, by title, optionally in one
 * area. Filtered and paged in the query, never in JS (docs/ui-patterns.md,
 * "Pagination").
 */
export async function listProcedures(options: {
  area: string | null;
  page: number;
  pageSize?: number;
}): Promise<{ rows: ArticleRow[]; total: number }> {
  const supabase = await createClient();
  const { from, to } = pageRange(options.page, options.pageSize);
  let query = supabase
    .from("rc_articles")
    .select(ARTICLE_COLUMNS, { count: "exact" })
    .eq("kind", "procedure");
  if (options.area) query = query.eq("area", options.area);
  const result = await query.order("title").order("id").range(from, to);
  return readPage(result, "procedures", () => countProcedures(options.area));
}

/** How many procedures the viewer can read, in total or in one area. */
export async function countProcedures(area: string | null): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("rc_articles")
    .select("id", { count: "exact", head: true })
    .eq("kind", "procedure");
  if (area) query = query.eq("area", area);
  const result = await query;
  unwrapRead(result, "procedure count");
  return result.count ?? 0;
}

export interface ProcedureAreaCount {
  area: string;
  count: number;
}

/**
 * The areas actually in use among the procedures the viewer can read, with
 * counts — derived from the data itself (the same way the What's new
 * screen's Tool filter is derived from its notes), not a fixed list. `area`
 * is free text on `rc_articles` on purpose, so editors are free to introduce
 * a new one without a code change; a hardcoded chip/option list would drift
 * out of step with what's actually been used, and silently leave some
 * procedures unreachable through any filter.
 */
export async function listProcedureAreaCounts(): Promise<ProcedureAreaCount[]> {
  const supabase = await createClient();
  const result = await supabase.from("rc_articles").select("area").eq("kind", "procedure");
  const rows = unwrapRead(result, "procedure areas") ?? [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.area) continue;
    counts.set(row.area, (counts.get(row.area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => a.area.localeCompare(b.area));
}

export interface ProcedureLink {
  id: string;
  slug: string;
  title: string;
  area: string | null;
}

/**
 * Every procedure the viewer can read, by title, as links — the home page
 * groups these into area cards. Unpaged on purpose: the home page needs every
 * area's count and first few titles, and the full list is a few dozen rows.
 */
export async function listProcedureLinks(): Promise<ProcedureLink[]> {
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase
      .from("rc_articles")
      .select("id, slug, title, area")
      .eq("kind", "procedure")
      .order("title")
      .order("id"),
    "procedures",
  );
  return rows ?? [];
}

/**
 * The procedures pinned to the home page's "When something breaks on air"
 * block, in the order they were pinned. A pin on a procedure the viewer can't
 * read is filtered out by RLS on both tables.
 */
export async function listPinnedProcedures(): Promise<ProcedureLink[]> {
  const supabase = await createClient();
  const pins =
    unwrapRead(
      await supabase
        .from("rc_pinned_procedures")
        .select("article_id")
        .order("pinned_at")
        .order("article_id"),
      "pinned procedures",
    ) ?? [];
  if (pins.length === 0) return [];
  const rows =
    unwrapRead(
      await supabase
        .from("rc_articles")
        .select("id, slug, title, area")
        .eq("kind", "procedure")
        .in(
          "id",
          pins.map((pin) => pin.article_id),
        ),
      "pinned procedure titles",
    ) ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return pins.flatMap((pin) => byId.get(pin.article_id) ?? []);
}

export async function isProcedurePinned(articleId: string): Promise<boolean> {
  const supabase = await createClient();
  const pin = unwrapRead(
    await supabase
      .from("rc_pinned_procedures")
      .select("article_id")
      .eq("article_id", articleId)
      .maybeSingle(),
    "procedure pin",
  );
  return pin !== null;
}

/** One card per tool that has at least one guide the viewer can read. */
export async function listToolGuideSummaries(): Promise<ToolGuideSummary[]> {
  const supabase = await createClient();
  const [guides, tools] = await Promise.all([
    supabase
      .from("rc_articles")
      .select("slug, tool_id, sort_order, title, updated_at")
      .eq("kind", "guide")
      .order("sort_order")
      .order("title"),
    toolsById(),
  ]);
  const rows = unwrapRead(guides, "tool guides") ?? [];

  const byTool = new Map<string, ToolGuideSummary>();
  for (const guide of rows) {
    const tool = guide.tool_id ? tools.get(guide.tool_id) : undefined;
    if (!tool) continue;
    const summary = byTool.get(tool.id);
    if (!summary) {
      byTool.set(tool.id, {
        tool,
        count: 1,
        lastUpdated: guide.updated_at,
        firstSlug: guide.slug,
        guides: [{ slug: guide.slug, title: guide.title }],
      });
    } else {
      summary.count += 1;
      summary.guides.push({ slug: guide.slug, title: guide.title });
      if (guide.updated_at > summary.lastUpdated) summary.lastUpdated = guide.updated_at;
    }
  }
  return [...byTool.values()].sort((a, b) => a.tool.name.localeCompare(b.tool.name));
}

/** Release notes, newest first, each with its tool and the guides it changed. */
export async function listReleaseNotes(options: { limit?: number } = {}): Promise<ReleaseNote[]> {
  const supabase = await createClient();
  let query = supabase
    .from("rc_articles")
    .select(ARTICLE_COLUMNS)
    .eq("kind", "release_note")
    .order("released_on", { ascending: false })
    .order("title");
  if (options.limit) query = query.limit(options.limit);

  const [notesResult, tools] = await Promise.all([query, toolsById()]);
  const notes = unwrapRead(notesResult, "release notes") ?? [];
  if (notes.length === 0) return [];

  const links =
    unwrapRead(
      await supabase
        .from("rc_release_note_guides")
        .select("release_note_id, guide_id")
        .in(
          "release_note_id",
          notes.map((note) => note.id),
        ),
      "release note guides",
    ) ?? [];

  // A guide the viewer can't read (a tool they can't open) is filtered out
  // here by RLS, so its link simply doesn't render.
  const guideIds = [...new Set(links.map((link) => link.guide_id))];
  const guides =
    guideIds.length === 0
      ? []
      : (unwrapRead(
          await supabase.from("rc_articles").select("id, slug, title, tool_id").in("id", guideIds),
          "linked guides",
        ) ?? []);
  const guideById = new Map(guides.map((guide) => [guide.id, guide]));

  return notes.map((note) => ({
    ...note,
    tool: note.tool_id ? (tools.get(note.tool_id) ?? null) : null,
    guides: links
      .filter((link) => link.release_note_id === note.id)
      .flatMap((link) => {
        const guide = guideById.get(link.guide_id);
        const tool = guide?.tool_id ? tools.get(guide.tool_id) : undefined;
        return guide && tool ? [{ slug: guide.slug, title: guide.title, toolKey: tool.key }] : [];
      }),
  }));
}

export async function getProcedure(slug: string): Promise<ArticleRow | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase
      .from("rc_articles")
      .select(ARTICLE_COLUMNS)
      .eq("kind", "procedure")
      .eq("slug", slug)
      .maybeSingle(),
    "procedure",
  );
}

/** Every version of an article, newest first. */
export async function listVersions(articleId: string): Promise<RcArticleVersion[]> {
  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase
      .from("rc_article_versions")
      .select("*")
      .eq("article_id", articleId)
      .order("version", { ascending: false }),
    "article history",
  );
  return rows ?? [];
}

export interface GuideDetail {
  guide: ArticleRow;
  tool: ToolRef;
  siblings: { slug: string; title: string }[];
  versions: RcArticleVersion[];
  /** The newest release note that changed this guide, if any. */
  releaseNote: { slug: string; title: string; released_on: string | null } | null;
}

/** A tool's guides, in their list order — for redirecting /resources/tools/[key]. */
export async function listGuidesForTool(
  toolKey: string,
): Promise<{ tool: ToolRef; guides: { slug: string; title: string }[] } | null> {
  const supabase = await createClient();
  const tool = unwrapRead(
    await supabase.from("tools").select("id, key, name").eq("key", toolKey).maybeSingle(),
    "tool",
  );
  if (!tool) return null;
  const guides = unwrapRead(
    await supabase
      .from("rc_articles")
      .select("slug, title")
      .eq("kind", "guide")
      .eq("tool_id", tool.id)
      .order("sort_order")
      .order("title"),
    "tool guides",
  );
  return { tool, guides: guides ?? [] };
}

export async function getGuide(toolKey: string, slug: string): Promise<GuideDetail | null> {
  const listing = await listGuidesForTool(toolKey);
  if (!listing) return null;

  const supabase = await createClient();
  const guide = unwrapRead(
    await supabase
      .from("rc_articles")
      .select(ARTICLE_COLUMNS)
      .eq("kind", "guide")
      .eq("tool_id", listing.tool.id)
      .eq("slug", slug)
      .maybeSingle(),
    "guide",
  );
  if (!guide) return null;

  const [versions, linksResult] = await Promise.all([
    listVersions(guide.id),
    supabase.from("rc_release_note_guides").select("release_note_id").eq("guide_id", guide.id),
  ]);
  const noteIds = (unwrapRead(linksResult, "guide release notes") ?? []).map(
    (link) => link.release_note_id,
  );
  const releaseNote =
    noteIds.length === 0
      ? null
      : unwrapRead(
          await supabase
            .from("rc_articles")
            .select("slug, title, released_on")
            .in("id", noteIds)
            .order("released_on", { ascending: false })
            .limit(1)
            .maybeSingle(),
          "guide release note",
        );

  return { guide, tool: listing.tool, siblings: listing.guides, versions, releaseNote };
}

/** Ranked full-text search over everything the viewer can read. */
export async function searchArticles(query: string): Promise<SearchHit[]> {
  const supabase = await createClient();
  const ids = await rankedArticleIds(query, 30);
  if (ids.length === 0) return [];

  const [rowsResult, tools] = await Promise.all([
    supabase.from("rc_articles").select(ARTICLE_COLUMNS).in("id", ids),
    toolsById(),
  ]);
  const rows = unwrapRead(rowsResult, "search results") ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const article = byId.get(id);
    if (!article) return [];
    return [{ article, tool: article.tool_id ? (tools.get(article.tool_id) ?? null) : null }];
  });
}

/**
 * The tools a guide can be written for: every enabled, real registry row
 * except Resources itself. Proposed rows are ideas, not tools.
 */
export async function listGuideableTools(): Promise<ToolRef[]> {
  const supabase = await createClient();
  const tools = unwrapRead(
    await supabase
      .from("tools")
      .select("id, key, name")
      .eq("enabled", true)
      .neq("status", "proposed")
      .neq("key", "resources")
      .order("name"),
    "tools",
  );
  return tools ?? [];
}

/** One past (or the current) version of an article. */
export async function getArticleVersion(
  articleId: string,
  version: number,
): Promise<RcArticleVersion | null> {
  const supabase = await createClient();
  return unwrapRead(
    await supabase
      .from("rc_article_versions")
      .select("*")
      .eq("article_id", articleId)
      .eq("version", version)
      .maybeSingle(),
    "article version",
  );
}

/**
 * Article ids ranked by rc_search_articles (RLS-scoped): keyword — every
 * word first, any of the words (anyWordQuery) only if that finds nothing —
 * fused with semantic ranking when an embedding key is configured.
 */
export async function rankedArticleIds(query: string, limit: number): Promise<string[]> {
  const supabase = await createClient();
  const ranked = unwrapRead(
    await supabase.rpc("rc_search_articles", {
      p_query: query,
      p_limit: limit,
      p_fallback_query: anyWordQuery(query),
      p_embedding: await embedSearchQuery(query),
    }),
    "search",
  );
  return (ranked ?? []).map((hit) => hit.id);
}
