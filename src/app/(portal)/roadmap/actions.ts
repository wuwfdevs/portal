"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertAdministrator } from "@/lib/auth/authz";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertRoadmapAccess, assertRoadmapCurator } from "@/lib/roadmap/access";
import {
  isEmptyRichText,
  parseRichText,
  richTextToPlainText,
  type RichTextDoc,
} from "@/lib/roadmap/rich-text";
import { validatePostInput, validateStatusChange } from "@/lib/roadmap/posts";
import type { RdPostKind, RdPostStatus } from "@/lib/database.types";

const LIST_PATH = "/roadmap";
const POST_KINDS: RdPostKind[] = ["feature", "improvement", "bug", "new_tool"];
const POST_STATUSES: RdPostStatus[] = [
  "open",
  "under_review",
  "planned",
  "in_progress",
  "shipped",
  "declined",
];
const TOOL_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function postPath(postId: string): string {
  return `${LIST_PATH}/${postId}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function kindField(formData: FormData): RdPostKind {
  const value = field(formData, "kind");
  return POST_KINDS.includes(value as RdPostKind) ? (value as RdPostKind) : "feature";
}

/**
 * The body arrives as the JSON string the rich-text editor's hidden input
 * posts. It is re-parsed against the whitelist here and the normalized
 * document is what gets stored — the browser's copy is never trusted, and the
 * renderer validates again on the way out.
 */
function bodyField(formData: FormData, name: string, path: string): RichTextDoc {
  const doc = parseRichText(formData.get(name));
  if (!doc) failWith(path, "That description could not be read. Try retyping it.");
  return doc;
}

/**
 * A write RLS refuses is not an error — PostgREST reports it as zero rows
 * affected, which would otherwise redirect as though it had worked. These
 * actions only gate on membership; whether this particular row is *yours* is
 * decided by the policy, so this is where that answer is read back.
 */
function refusedByRls(rows: unknown[] | null, path: string, message: string): void {
  if (!rows || rows.length === 0) failWith(path, message);
}

// Posts -------------------------------------------------------------------------

export async function createPost(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapAccess();
  const newPath = `${LIST_PATH}/new`;

  const title = field(formData, "title");
  const kind = kindField(formData);
  const toolId = field(formData, "tool_id") || null;
  const proposedToolName = field(formData, "proposed_tool_name");
  const body = bodyField(formData, "body", newPath);
  const bodyText = richTextToPlainText(body);

  const problem = validatePostInput({ title, bodyText, kind, toolId, proposedToolName });
  if (problem) failWith(newPath, problem);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rd_posts")
    .insert({
      title,
      body,
      body_text: bodyText,
      kind,
      tool_id: toolId,
      // Only meaningful for a new-tool request with nothing to point at yet.
      proposed_tool_name: kind === "new_tool" && !toolId ? proposedToolName : null,
      author_id: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, newPath, "Could not file the request");
  if (!data) failWith(newPath, "Could not file the request — no row was created.");

  revalidatePath(LIST_PATH);
  redirect(postPath(data.id));
}

export async function updatePost(formData: FormData): Promise<void> {
  await assertRoadmapAccess();
  const postId = field(formData, "post_id");
  const path = `${postPath(postId)}/edit`;

  const title = field(formData, "title");
  const body = bodyField(formData, "body", path);
  const bodyText = richTextToPlainText(body);

  // kind and tool_id are curation, guarded in the database — an author edits
  // their own words, not the post's classification.
  const problem = validatePostInput({
    title,
    bodyText,
    kind: "feature",
    toolId: null,
    proposedToolName: "",
  });
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rd_posts")
    .update({ title, body, body_text: bodyText })
    .eq("id", postId)
    .select("id");
  failIfError(error, path, "Could not save the request");
  refusedByRls(data, path, "You can only edit your own request.");

  revalidatePath(LIST_PATH);
  redirect(postPath(postId));
}

export async function deletePost(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapAccess();
  const postId = field(formData, "post_id");

  const supabase = await createClient();
  const { data, error } = await supabase.from("rd_posts").delete().eq("id", postId).select("id");
  failIfError(error, postPath(postId), "Could not delete the request");
  refusedByRls(data, postPath(postId), "You can only delete your own request.");

  // Deleting takes other people's votes and comments with it, so it is audited
  // even when the author does it to their own post.
  await logAuditEvent({
    actorId: profile.id,
    action: "roadmap.post.deleted",
    targetType: "rd_post",
    targetId: postId,
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

// Votes -------------------------------------------------------------------------

/**
 * One row per person per post, so there is nothing to toggle in place: the
 * vote is inserted or deleted. The composite primary key is what makes a
 * double-submit harmless.
 */
export async function toggleVote(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapAccess();
  const postId = field(formData, "post_id");
  const returnTo = field(formData, "return_to") || postPath(postId);
  const voted = field(formData, "voted") === "true";

  const supabase = await createClient();
  if (voted) {
    const { error } = await supabase
      .from("rd_votes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", profile.id);
    failIfError(error, returnTo, "Could not remove your vote");
  } else {
    const { error } = await supabase
      .from("rd_votes")
      .insert({ post_id: postId, user_id: profile.id });
    failIfError(error, returnTo, "Could not record your vote");
  }

  revalidatePath(LIST_PATH);
  redirect(returnTo);
}

// Comments ----------------------------------------------------------------------

export async function addComment(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapAccess();
  const postId = field(formData, "post_id");
  const path = postPath(postId);

  const body = bodyField(formData, "body", path);
  if (isEmptyRichText(body)) failWith(path, "Write something before posting a comment.");

  const supabase = await createClient();
  const { error } = await supabase.from("rd_comments").insert({
    post_id: postId,
    author_id: profile.id,
    body,
    body_text: richTextToPlainText(body),
  });
  failIfError(error, path, "Could not post the comment");

  redirect(path);
}

export async function updateComment(formData: FormData): Promise<void> {
  await assertRoadmapAccess();
  const postId = field(formData, "post_id");
  const commentId = field(formData, "comment_id");
  const path = postPath(postId);

  const body = bodyField(formData, "body", path);
  if (isEmptyRichText(body)) failWith(path, "A comment cannot be emptied — delete it instead.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rd_comments")
    .update({ body, body_text: richTextToPlainText(body) })
    .eq("id", commentId)
    .select("id");
  failIfError(error, path, "Could not save the comment");
  refusedByRls(data, path, "You can only edit your own comment.");

  redirect(path);
}

export async function deleteComment(formData: FormData): Promise<void> {
  await assertRoadmapAccess();
  const postId = field(formData, "post_id");
  const commentId = field(formData, "comment_id");
  const path = postPath(postId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rd_comments")
    .delete()
    .eq("id", commentId)
    .select("id");
  failIfError(error, path, "Could not delete the comment");
  refusedByRls(data, path, "You can only delete your own comment.");

  redirect(path);
}

// Curation ----------------------------------------------------------------------

export async function setPostStatus(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapCurator();
  const postId = field(formData, "post_id");
  const path = postPath(postId);
  const statusRaw = field(formData, "status");
  if (!POST_STATUSES.includes(statusRaw as RdPostStatus)) {
    failWith(path, "That is not a status a request can be in.");
  }
  const status = statusRaw as RdPostStatus;
  const note = field(formData, "status_note");

  const problem = validateStatusChange(status, note);
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  const { error } = await supabase
    .from("rd_posts")
    .update({
      status,
      // The note belongs to the decision it explains, so it is cleared when
      // the post moves off `declined` rather than left to describe a state the
      // post is no longer in.
      status_note: status === "declined" ? note : null,
      status_changed_at: new Date().toISOString(),
      status_changed_by: profile.id,
    })
    .eq("id", postId);
  failIfError(error, path, "Could not change the status");

  await logAuditEvent({
    actorId: profile.id,
    action: "roadmap.post.status_changed",
    targetType: "rd_post",
    targetId: postId,
    metadata: { status },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

export async function setPostTool(formData: FormData): Promise<void> {
  const { profile } = await assertRoadmapCurator();
  const postId = field(formData, "post_id");
  const path = postPath(postId);
  const toolId = field(formData, "tool_id") || null;
  const kind = kindField(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("rd_posts")
    .update({
      tool_id: toolId,
      kind,
      // Once a request points at a real registry row, the free-text name it was
      // filed with is superseded.
      ...(toolId ? { proposed_tool_name: null } : {}),
    })
    .eq("id", postId);
  failIfError(error, path, "Could not change what this request is about");

  await logAuditEvent({
    actorId: profile.id,
    action: "roadmap.post.tool_linked",
    targetType: "rd_post",
    targetId: postId,
    metadata: { tool_id: toolId, kind },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}

/**
 * Turns a new-tool request's free-text name into a real `proposed` registry
 * row and points the post at it. Administrator-only, not curator-only: this
 * writes into public.tools, which `tools_write_admin_only` has always
 * restricted to platform administrators. That boundary does not move for this
 * tool — see docs/roadmap-design.md §3E.
 */
export async function promoteToProposedTool(formData: FormData): Promise<void> {
  const admin = await assertAdministrator();
  const postId = field(formData, "post_id");
  const path = postPath(postId);
  const name = field(formData, "name");
  const key = field(formData, "key").toLowerCase();
  const description = field(formData, "description");

  if (!name) failWith(path, "Give the proposed tool a name.");
  if (!description) failWith(path, "Describe what the proposed tool would do.");
  if (!TOOL_KEY_PATTERN.test(key)) {
    failWith(path, "The key must be lowercase letters, numbers, and hyphens.");
  }

  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase
    .from("tools")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  failIfError(lookupError, path, "Could not check whether that key is taken");
  if (existing) failWith(path, `A tool with the key "${key}" already exists.`);

  const { data: tool, error } = await supabase
    .from("tools")
    .insert({
      key,
      name,
      description,
      route: `/tools/${key}`,
      status: "proposed",
      enabled: false,
      default_access: "invite_only",
      sort_order: 99,
    })
    .select("id")
    .single();
  failIfError(error, path, "Could not create the proposed tool");
  if (!tool) failWith(path, "Could not create the proposed tool — no row was created.");

  const { error: linkError } = await supabase
    .from("rd_posts")
    .update({ tool_id: tool.id, proposed_tool_name: null })
    .eq("id", postId);
  failIfError(linkError, path, "Created the proposed tool, but could not link this request to it");

  await logAuditEvent({
    actorId: admin.id,
    action: "roadmap.tool.promoted",
    targetType: "tool",
    targetId: tool.id,
    metadata: { key, name, from_post: postId },
  });

  revalidatePath(LIST_PATH);
  redirect(path);
}
