import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { articleHref } from "./queries";
import { helpContextForPath, screenName } from "./screens";

// What the in-tool Help panel shows for one URL. Every read goes through the
// RLS-scoped client, so the panel only ever lists guides and release notes
// the viewer could open on /resources — the same audience and tool-access
// rules, no second implementation of them.

export interface HelpLink {
  title: string;
  summary: string | null;
  href: string;
}

export interface HelpReleaseNote {
  title: string;
  releasedOn: string;
  href: string;
}

export interface HelpContent {
  tool: { key: string; name: string };
  /** Null on a tool page no screen covers; `guides` is then all the tool's guides. */
  screen: { key: string; name: string } | null;
  guides: HelpLink[];
  recent: HelpReleaseNote[];
  /** Search results within this tool's guides, when a query was given. */
  results: HelpLink[] | null;
  /** The tool's first guide, or /resources when it has none yet. */
  allGuidesHref: string;
}

const RECENT_NOTES = 2;

/** Null when the URL isn't a tool page (the Help button doesn't show there). */
export async function loadHelpContent(
  pathname: string,
  search: string,
  query: string,
): Promise<HelpContent | null> {
  const context = helpContextForPath(pathname, search);
  if (!context) return null;

  const supabase = await createClient();
  const tool = unwrapRead(
    await supabase.from("tools").select("id, key, name").eq("key", context.toolKey).maybeSingle(),
    "tool",
  );
  // A tool the viewer can't see at all: no guides to offer, but still name it.
  const toolRef = { key: context.toolKey, name: tool?.name ?? context.toolKey };
  const screen = context.screenKey
    ? { key: context.screenKey, name: screenName(context.screenKey) ?? context.screenKey }
    : null;
  if (!tool) {
    return {
      tool: toolRef,
      screen,
      guides: [],
      recent: [],
      results: query ? [] : null,
      allGuidesHref: "/resources",
    };
  }

  let guidesQuery = supabase
    .from("rc_articles")
    .select("slug, kind, title, summary")
    .eq("kind", "guide")
    .eq("tool_id", tool.id)
    .order("sort_order")
    .order("title");
  if (screen) guidesQuery = guidesQuery.contains("screen_keys", [screen.key]);

  const [guidesResult, notesResult, firstGuideResult, results] = await Promise.all([
    guidesQuery,
    supabase
      .from("rc_articles")
      .select("slug, kind, title, released_on")
      .eq("kind", "release_note")
      .eq("tool_id", tool.id)
      .order("released_on", { ascending: false })
      .order("title")
      .limit(RECENT_NOTES),
    supabase
      .from("rc_articles")
      .select("slug")
      .eq("kind", "guide")
      .eq("tool_id", tool.id)
      .order("sort_order")
      .order("title")
      .limit(1)
      .maybeSingle(),
    query ? searchToolGuides(tool.id, tool.key, query) : Promise.resolve(null),
  ]);

  const link = (row: { slug: string; kind: "guide"; title: string; summary: string | null }) => ({
    title: row.title,
    summary: row.summary,
    href: articleHref(row, tool),
  });
  const firstGuide = unwrapRead(firstGuideResult, "first guide");

  return {
    tool: toolRef,
    screen,
    guides: (unwrapRead(guidesResult, "guides") ?? []).map((row) =>
      link({ ...row, kind: "guide" }),
    ),
    recent: (unwrapRead(notesResult, "release notes") ?? []).flatMap((row) =>
      row.released_on
        ? [{ title: row.title, releasedOn: row.released_on, href: articleHref(row, tool) }]
        : [],
    ),
    results,
    allGuidesHref: firstGuide ? `/resources/tools/${tool.key}/${firstGuide.slug}` : "/resources",
  };
}

/** Ranked full-text search, narrowed to this tool's guides. */
async function searchToolGuides(
  toolId: string,
  toolKey: string,
  query: string,
): Promise<HelpLink[]> {
  const supabase = await createClient();
  const ranked = unwrapRead(
    await supabase.rpc("rc_search_articles", { p_query: query, p_limit: 50 }),
    "help search",
  );
  const ids = (ranked ?? []).map((hit) => hit.id);
  if (ids.length === 0) return [];
  const rows =
    unwrapRead(
      await supabase
        .from("rc_articles")
        .select("id, slug, title, summary")
        .in("id", ids)
        .eq("kind", "guide")
        .eq("tool_id", toolId),
      "help search results",
    ) ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            title: row.title,
            summary: row.summary,
            href: articleHref({ kind: "guide", slug: row.slug }, { key: toolKey }),
          },
        ]
      : [];
  });
}
