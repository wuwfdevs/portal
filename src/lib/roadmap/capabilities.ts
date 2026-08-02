// The Roadmap tool's capability layer (docs/agent-capabilities-design.md §4).
// Four entries: filing a request, reading the list back, voting, and
// commenting — all member-level and confirmation: "none", each mirroring what
// an author can already do to their own content or to the shared vote/comment
// surface unprompted. Reversible, visible immediately, author-attributed.
//
// Curation (setPostStatus, setPostTool) and the administrator-only
// promoteToProposedTool are deliberately not exposed here — reconsidered
// explicitly, not just left over by default: moving a post's status, or
// turning a free-text new-tool request into a real registry row, is a
// judgment call meant to be made by a person on the screen that shows the
// full discussion, not delegated to an agent even behind this repo's
// confirmation-required gate. Editing or deleting an existing post/comment
// (updatePost, deletePost, updateComment, deleteComment) isn't exposed yet
// either — voting and commenting cover "let an agent participate in the
// roadmap" without touching content someone else authored or is relying on.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertRoadmapAccess } from "./access";
import { listPosts } from "./queries";
import { normalizeSort, validatePostInput } from "./posts";
import {
  isEmptyRichText,
  parseRichText,
  plainTextToRichTextDoc,
  richTextToPlainText,
} from "./rich-text";
import type { RdPostKind, RdPostStatus } from "@/lib/database.types";

const POST_KIND = z.enum(["feature", "improvement", "bug", "new_tool"]);
const POST_STATUS = z.enum([
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
]);

export type CreateRoadmapPostResult =
  { ok: true; postId: string; url: string } | { ok: false; message: string };

/**
 * `body` is plain text here rather than a ProseMirror document: an agent has
 * no editor, and asking one to hand-assemble ProseMirror JSON would be a way
 * to get malformed documents into the column. `plainTextToRichTextDoc` wraps
 * it into a document, which still goes through the same whitelist every
 * other write goes through.
 */
export const createRoadmapPost = defineCapability({
  id: "roadmap.post.create",
  summary:
    "File a request on the Roadmap — a wishlist entry for something these tools should do. Use roadmap.post.list first to check whether someone has already asked, since voting on an existing request counts for more than filing a duplicate.",
  input: z.object({
    title: z.string().trim(),
    body: z.string(),
    kind: POST_KIND.default("improvement"),
    /** A `tools.id`, from roadmap.post.list's results — not a tool key. */
    toolId: z.string().trim().optional(),
    proposedToolName: z.string().trim().optional(),
  }),
  requires: { tool: "roadmap" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<CreateRoadmapPostResult> {
    const { profile } = await assertRoadmapAccess();

    const parsed = parseRichText(plainTextToRichTextDoc(input.body));
    if (!parsed) return { ok: false, message: "Could not read that description." };
    const bodyText = richTextToPlainText(parsed);

    const problem = validatePostInput({
      title: input.title,
      bodyText,
      kind: input.kind as RdPostKind,
      toolId: input.toolId ?? null,
      proposedToolName: input.proposedToolName ?? "",
    });
    if (problem) return { ok: false, message: problem };

    const { data, error } = await supabase
      .from("rd_posts")
      .insert({
        title: input.title.trim(),
        body: parsed,
        body_text: bodyText,
        kind: input.kind as RdPostKind,
        tool_id: input.toolId || null,
        proposed_tool_name:
          input.kind === "new_tool" && !input.toolId ? (input.proposedToolName ?? null) : null,
        author_id: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      console.error("Could not file the request:", error);
      return { ok: false, message: `Could not file the request: ${error.message}` };
    }
    if (!data) return { ok: false, message: "Could not file the request — no row was created." };

    return { ok: true, postId: data.id, url: `/roadmap/${data.id}` };
  },
});

export interface RoadmapPostSummaryForAgent {
  id: string;
  title: string;
  summary: string;
  kind: RdPostKind;
  status: RdPostStatus;
  about: string | null;
  votes: number;
  comments: number;
  url: string;
}

export const listRoadmapPosts = defineCapability({
  id: "roadmap.post.list",
  summary:
    "List requests on the Roadmap, newest or most-voted first, optionally filtered by status, kind, or which tool they are about. Use this to check for an existing request before filing one, or to answer what is planned, in progress, or shipped.",
  input: z.object({
    status: POST_STATUS.optional(),
    kind: POST_KIND.optional(),
    toolId: z.string().trim().optional(),
    sort: z.enum(["top", "new"]).optional(),
    limit: z.number().int().positive().max(50).default(20),
  }),
  requires: { tool: "roadmap" },
  confirmation: "none",
  async handler(_ctx, input): Promise<{ posts: RoadmapPostSummaryForAgent[] }> {
    const { profile } = await assertRoadmapAccess();

    const posts = await listPosts(profile.id, {
      status: input.status as RdPostStatus | undefined,
      kind: input.kind as RdPostKind | undefined,
      toolId: input.toolId || undefined,
      sort: normalizeSort(input.sort),
    });

    return {
      posts: posts.slice(0, input.limit).map((post) => ({
        id: post.id,
        title: post.title,
        summary: post.body_text.slice(0, 400),
        kind: post.kind,
        status: post.status,
        about: post.target?.name ?? post.proposedToolName,
        votes: post.voteCount,
        comments: post.commentCount,
        url: `/roadmap/${post.id}`,
      })),
    };
  },
});

export type VoteOnRoadmapPostResult =
  { ok: true; voted: boolean; voteCount: number } | { ok: false; message: string };

/**
 * Reads the current vote before acting rather than blindly toggling: an
 * agent, unlike the UI, has no guarantee it last rendered this post's vote
 * state, so `action` says what the caller wants and this makes getting there
 * idempotent regardless of where the vote actually stood.
 */
export const voteOnRoadmapPost = defineCapability({
  id: "roadmap.post.vote",
  summary:
    "Vote or remove your vote on a Roadmap request. Specify which explicitly — this does not blindly toggle, since an agent has no guarantee it knows the current vote state.",
  input: z.object({
    postId: z.string(),
    action: z.enum(["vote", "unvote"]),
  }),
  requires: { tool: "roadmap" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<VoteOnRoadmapPostResult> {
    const { profile } = await assertRoadmapAccess();

    const { data: existing, error: lookupError } = await supabase
      .from("rd_votes")
      .select("post_id")
      .eq("post_id", input.postId)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (lookupError) {
      return { ok: false, message: `Could not check your vote: ${lookupError.message}` };
    }

    if (input.action === "vote" && !existing) {
      const { error } = await supabase
        .from("rd_votes")
        .insert({ post_id: input.postId, user_id: profile.id });
      if (error) return { ok: false, message: `Could not record your vote: ${error.message}` };
    } else if (input.action === "unvote" && existing) {
      const { error } = await supabase
        .from("rd_votes")
        .delete()
        .eq("post_id", input.postId)
        .eq("user_id", profile.id);
      if (error) return { ok: false, message: `Could not remove your vote: ${error.message}` };
    }

    const { count } = await supabase
      .from("rd_votes")
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", input.postId);

    return { ok: true, voted: input.action === "vote", voteCount: count ?? 0 };
  },
});

export type AddRoadmapCommentResult =
  { ok: true; commentId: string } | { ok: false; message: string };

export const addRoadmapComment = defineCapability({
  id: "roadmap.comment.add",
  summary: "Post a comment on a Roadmap request. Plain text — it will be wrapped into paragraphs.",
  input: z.object({ postId: z.string(), body: z.string() }),
  requires: { tool: "roadmap" },
  confirmation: "none",
  async handler({ supabase }, input): Promise<AddRoadmapCommentResult> {
    const { profile } = await assertRoadmapAccess();

    const parsed = parseRichText(plainTextToRichTextDoc(input.body));
    if (!parsed || isEmptyRichText(parsed)) {
      return { ok: false, message: "Write something before posting a comment." };
    }
    const bodyText = richTextToPlainText(parsed);

    const { data, error } = await supabase
      .from("rd_comments")
      .insert({ post_id: input.postId, author_id: profile.id, body: parsed, body_text: bodyText })
      .select("id")
      .single();
    if (error) return { ok: false, message: `Could not post the comment: ${error.message}` };
    if (!data) return { ok: false, message: "Could not post the comment — no row was created." };

    return { ok: true, commentId: data.id };
  },
});
