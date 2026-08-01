import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database, RdPostKind, RdPostStatus } from "@/lib/database.types";
import { sortPosts, type PostSort } from "./posts";

/**
 * Data access for the Roadmap tool. Every read goes through the RLS-scoped
 * server client, so `private.has_roadmap_access` is what actually decides what
 * comes back — these functions add shape, not authorization. Reads are
 * unwrapped rather than defaulted to `[]`, per CLAUDE.md: a query that errors
 * and falls back to empty renders exactly like a healthy empty state.
 */

export type RdPost = Database["public"]["Tables"]["rd_posts"]["Row"];
export type RdComment = Database["public"]["Tables"]["rd_comments"]["Row"];

export interface PostTarget {
  id: string;
  name: string;
  /** True for a tools row that is only an idea — rendered differently. */
  proposed: boolean;
}

export interface PostSummary {
  id: string;
  title: string;
  body_text: string;
  kind: RdPostKind;
  status: RdPostStatus;
  created_at: string;
  authorName: string;
  target: PostTarget | null;
  proposedToolName: string | null;
  voteCount: number;
  commentCount: number;
  votedByMe: boolean;
}

export interface PostDetail extends PostSummary {
  body: unknown;
  author_id: string;
  tool_id: string | null;
  status_note: string | null;
  status_changed_at: string | null;
  statusChangedByName: string | null;
  updated_at: string;
  comments: PostComment[];
}

export interface PostComment {
  id: string;
  body: unknown;
  author_id: string;
  authorName: string;
  created_at: string;
  updated_at: string;
}

export interface PostFilters {
  status?: RdPostStatus;
  kind?: RdPostKind;
  toolId?: string;
  sort: PostSort;
}

/**
 * Display names are a courtesy column: `profiles` RLS only shows a non-admin
 * their own row, so this read is frequently short and must never be an error.
 * Same commented exception as lib/audience-listening/queries.ts.
 */
async function displayNames(userIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id, display_name").in("id", unique);
  const rows = result.error ? [] : (result.data ?? []);
  return new Map(rows.map((row) => [row.id, row.display_name]));
}

function tally(rows: { post_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Deliberately four flat reads aggregated here rather than embedded selects:
 * `database.types.ts` is hand-written with empty `Relationships` (see its
 * header), so PostgREST embedding has no foreign-key metadata to type against.
 * The vote and comment counts come from the same pass, which is why rd_posts
 * carries no denormalized counters — see the migration's comment.
 */
export async function listPosts(viewerId: string, filters: PostFilters): Promise<PostSummary[]> {
  const supabase = await createClient();

  let query = supabase.from("rd_posts").select("*");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.toolId) query = query.eq("tool_id", filters.toolId);

  const posts =
    unwrapRead(await query.order("created_at", { ascending: false }), "roadmap requests") ?? [];
  if (posts.length === 0) return [];

  const ids = posts.map((post) => post.id);
  const [voteRows, commentRows, tools, names] = await Promise.all([
    unwrapRead(
      await supabase.from("rd_votes").select("post_id, user_id").in("post_id", ids),
      "the votes on these requests",
    ) ?? [],
    unwrapRead(
      await supabase.from("rd_comments").select("post_id").in("post_id", ids),
      "the comments on these requests",
    ) ?? [],
    listTargetTools(),
    displayNames(posts.map((post) => post.author_id)),
  ]);

  const voteCounts = tally(voteRows);
  const commentCounts = tally(commentRows);
  const myVotes = new Set(voteRows.filter((row) => row.user_id === viewerId).map((r) => r.post_id));
  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));

  return sortPosts(
    posts.map((post) => ({
      id: post.id,
      title: post.title,
      body_text: post.body_text,
      kind: post.kind,
      status: post.status,
      created_at: post.created_at,
      authorName: names.get(post.author_id) ?? "A colleague",
      target: post.tool_id ? (toolsById.get(post.tool_id) ?? null) : null,
      proposedToolName: post.proposed_tool_name,
      voteCount: voteCounts.get(post.id) ?? 0,
      commentCount: commentCounts.get(post.id) ?? 0,
      votedByMe: myVotes.has(post.id),
    })),
    filters.sort,
  );
}

export async function getPostDetail(id: string, viewerId: string): Promise<PostDetail | null> {
  const supabase = await createClient();
  const post = unwrapRead(
    await supabase.from("rd_posts").select("*").eq("id", id).maybeSingle(),
    "this request",
  );
  if (!post) return null;

  const [voteRows, comments, tools] = await Promise.all([
    unwrapRead(
      await supabase.from("rd_votes").select("post_id, user_id").eq("post_id", id),
      "this request's votes",
    ) ?? [],
    unwrapRead(
      await supabase
        .from("rd_comments")
        .select("*")
        .eq("post_id", id)
        .order("created_at", { ascending: true }),
      "this request's comments",
    ) ?? [],
    listTargetTools(),
  ]);

  const names = await displayNames([
    post.author_id,
    ...(post.status_changed_by ? [post.status_changed_by] : []),
    ...comments.map((comment) => comment.author_id),
  ]);
  const target = post.tool_id ? (tools.find((tool) => tool.id === post.tool_id) ?? null) : null;

  return {
    id: post.id,
    title: post.title,
    body: post.body,
    body_text: post.body_text,
    kind: post.kind,
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at,
    author_id: post.author_id,
    authorName: names.get(post.author_id) ?? "A colleague",
    tool_id: post.tool_id,
    target,
    proposedToolName: post.proposed_tool_name,
    status_note: post.status_note,
    status_changed_at: post.status_changed_at,
    statusChangedByName: post.status_changed_by
      ? (names.get(post.status_changed_by) ?? null)
      : null,
    voteCount: voteRows.length,
    commentCount: comments.length,
    votedByMe: voteRows.some((row) => row.user_id === viewerId),
    comments: comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      author_id: comment.author_id,
      authorName: names.get(comment.author_id) ?? "A colleague",
      created_at: comment.created_at,
      updated_at: comment.updated_at,
    })),
  };
}

/**
 * Everything a post may target: the real tools this user can see, plus every
 * proposal. Proposals are only visible here because of the additive
 * `tools_select_proposed_for_roadmap` policy — nowhere else in the portal
 * shows them.
 */
export async function listTargetTools(): Promise<PostTarget[]> {
  const supabase = await createClient();
  const tools =
    unwrapRead(
      await supabase.from("tools").select("id, name, status").order("sort_order").order("name"),
      "the list of tools",
    ) ?? [];

  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    proposed: tool.status === "proposed",
  }));
}
