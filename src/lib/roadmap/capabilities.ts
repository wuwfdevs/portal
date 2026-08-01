// The Roadmap tool's capability layer (docs/agent-capabilities-design.md §4).
// Two entries: filing a request, and reading the list back. Both are the same
// logic the screens use, shaped as a typed result instead of a redirect, so an
// agent asked "has anyone already asked for this?" can answer before someone
// files a duplicate.
//
// Neither is confirmation-gated: filing a request is reversible by its author,
// costs nothing, and is visible to everyone the moment it lands. Curation —
// moving a post's status, promoting a proposal — is deliberately NOT exposed
// here; those are decisions, and a decision should be made by a person on the
// screen that shows the discussion.

import "server-only";
import { z } from "zod";
import { defineCapability } from "@/lib/capabilities/define";
import { assertRoadmapAccess } from "./access";
import { listPosts } from "./queries";
import { normalizeSort, validatePostInput } from "./posts";
import { parseRichText, richTextToPlainText } from "./rich-text";
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
 * to get malformed documents into the column. The paragraphs it writes are
 * wrapped into a document by this handler, through the same whitelist every
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

    const body = {
      type: "doc" as const,
      content: input.body
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => ({
          type: "paragraph",
          content: [{ type: "text", text: paragraph }],
        })),
    };
    const parsed = parseRichText(body);
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
