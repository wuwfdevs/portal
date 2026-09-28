"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/audit";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { assertResourcesEditor } from "@/lib/resources/access";
import { validateArticleForm, type ArticleFormInput } from "@/lib/resources/article-form";
import { RESOURCES_MEDIA_BUCKET } from "@/lib/resources/screenshot-rules";
import { figureMediaIds, parseRichText, type RichTextDoc } from "@/lib/rich-text";

// Create, edit, and delete for procedures and guides. Every write is
// editor-only: assertResourcesEditor() first, and RLS on rc_articles /
// rc_media / the bucket behind it. Versioning is the database's job — the
// rc_articles triggers bump `version` and snapshot each version into
// rc_article_versions; these actions only say who wrote it and why
// (updated_by, version_note).

type ArticleKind = "procedure" | "guide";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function readForm(formData: FormData, kind: ArticleKind): ArticleFormInput {
  return {
    kind,
    title: field(formData, "title"),
    slug: field(formData, "slug"),
    summary: field(formData, "summary"),
    audience: formData.getAll("audience").map(String),
    versionNote: field(formData, "version_note"),
    area: field(formData, "area"),
    ownerRole: field(formData, "owner_role"),
    toolKey: field(formData, "tool_key"),
    screenKeys: formData.getAll("screen_keys").map(String),
    sortOrder: field(formData, "sort_order"),
  };
}

function kindField(formData: FormData): ArticleKind {
  return field(formData, "kind") === "guide" ? "guide" : "procedure";
}

/** Where a failed write bounces back to: the form itself, naming the field. */
function withField(path: string, name: string | null): string {
  if (!name) return path;
  return `${path}${path.includes("?") ? "&" : "?"}field=${encodeURIComponent(name)}`;
}

function detailPath(kind: ArticleKind, slug: string, toolKey: string | null): string {
  return kind === "guide" ? `/resources/tools/${toolKey}/${slug}` : `/resources/procedures/${slug}`;
}

/**
 * The body arrives as the editor's JSON string and is re-parsed against the
 * whitelist here; the normalized document is what's stored.
 */
function bodyField(formData: FormData, path: string, allowFigures: boolean): RichTextDoc {
  const doc = parseRichText(formData.get("body"), { allowFigures });
  if (!doc) failWith(path, "The text could not be read. Try the edit again.");
  return doc;
}

async function toolKeysById(): Promise<{ ids: Map<string, string>; keys: Set<string> }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tools")
    .select("id, key")
    .eq("enabled", true)
    .neq("status", "proposed")
    .neq("key", "resources");
  if (error) throw new Error(`Could not load tools: ${error.message}`);
  const ids = new Map((data ?? []).map((tool) => [tool.key, tool.id]));
  return { ids, keys: new Set(ids.keys()) };
}

export async function createArticle(formData: FormData): Promise<void> {
  const { profile } = await assertResourcesEditor();
  const kind = kindField(formData);
  const toolParam = field(formData, "tool_key");
  const formPath =
    kind === "guide"
      ? `/resources/guides/new?tool=${encodeURIComponent(toolParam)}`
      : "/resources/procedures/new";

  const tools = await toolKeysById();
  const result = validateArticleForm(readForm(formData, kind), tools.keys);
  if (!result.ok) failWith(withField(formPath, result.field), result.message);
  const { fields } = result;
  // A new article has no id yet, so it has no screenshots either; the form
  // offers them once it exists.
  const body = bodyField(formData, formPath, false);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rc_articles")
    .insert({
      slug: fields.slug,
      kind,
      title: fields.title,
      summary: fields.summary,
      body,
      audience: fields.audience,
      area: fields.area,
      owner_role: fields.ownerRole,
      tool_id: fields.toolKey ? (tools.ids.get(fields.toolKey) ?? null) : null,
      screen_keys: fields.screenKeys,
      sort_order: fields.sortOrder,
      source: "editor",
      version_note: fields.versionNote ?? "Created",
      updated_by: profile.id,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    failWith(withField(formPath, "slug"), "Something already uses that address. Choose another.");
  }
  failIfError(error, formPath, "Could not save");
  if (!data) failWith(formPath, "Could not save: nothing was written.");

  await logAuditEvent({
    actorId: profile.id,
    action: "rc.article.created",
    targetType: "rc_article",
    targetId: data.id,
    metadata: { kind, slug: fields.slug },
  });
  revalidatePath("/resources", "layout");
  redirect(`${detailPath(kind, fields.slug, fields.toolKey)}?saved=created`);
}

export async function updateArticle(formData: FormData): Promise<void> {
  const { profile } = await assertResourcesEditor();
  const id = field(formData, "id");
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("rc_articles")
    .select("id, kind, slug, tool_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(`Could not load the article: ${readError.message}`);
  if (!existing || existing.kind === "release_note") redirect("/resources");

  const kind: ArticleKind = existing.kind;
  const tools = await toolKeysById();
  const currentToolKey =
    [...tools.ids].find(([, toolId]) => toolId === existing.tool_id)?.[0] ?? null;
  const formPath =
    kind === "guide"
      ? `/resources/tools/${currentToolKey}/${existing.slug}/edit`
      : `/resources/procedures/${existing.slug}/edit`;

  // The address is fixed once an article exists: release migrations match
  // guides on slug, and links to a procedure shouldn't break on an edit.
  const input = { ...readForm(formData, kind), slug: existing.slug };
  if (kind === "guide") input.toolKey = currentToolKey ?? "";
  const result = validateArticleForm(input, tools.keys);
  if (!result.ok) failWith(withField(formPath, result.field), result.message);
  const { fields } = result;

  const body = bodyField(formData, formPath, true);
  const mediaIds = figureMediaIds(body);
  if (mediaIds.length > 0) {
    const { data: media, error: mediaError } = await supabase
      .from("rc_media")
      .select("id")
      .in("id", mediaIds);
    failIfError(mediaError, formPath, "Could not check the screenshots");
    if ((media ?? []).length !== mediaIds.length) {
      failWith(formPath, "A screenshot in the text is missing. Remove it and add it again.");
    }
  }

  const { data: updated, error } = await supabase
    .from("rc_articles")
    .update({
      title: fields.title,
      summary: fields.summary,
      body,
      audience: fields.audience,
      area: fields.area,
      owner_role: fields.ownerRole,
      screen_keys: fields.screenKeys,
      sort_order: fields.sortOrder,
      // An editor's save: the trigger marks the guide as diverged from its
      // last release, and saving is how an editor reconciles one flagged
      // for review.
      source: "editor",
      version_note: fields.versionNote,
      needs_review: false,
      updated_by: profile.id,
    })
    .eq("id", id)
    .select("id");
  failIfError(error, formPath, "Could not save");
  if (!updated || updated.length === 0) failWith(formPath, "You can't edit this article.");

  await logAuditEvent({
    actorId: profile.id,
    action: "rc.article.updated",
    targetType: "rc_article",
    targetId: id,
    metadata: { kind, slug: existing.slug },
  });
  revalidatePath("/resources", "layout");
  redirect(`${detailPath(kind, existing.slug, currentToolKey)}?saved=updated`);
}

export async function deleteArticle(formData: FormData): Promise<void> {
  const { profile } = await assertResourcesEditor();
  const id = field(formData, "id");
  // Only ever back to an edit page under /resources.
  const requested = field(formData, "return_to");
  const returnPath = requested.startsWith("/resources/") ? requested : "/resources";
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("rc_articles")
    .select("id, kind, slug")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(`Could not load the article: ${readError.message}`);
  if (!existing || existing.kind === "release_note") redirect("/resources");

  // The article's own uploads go with it: the rows cascade, the objects
  // don't, so they're removed first. Shared captured shots are untouched.
  const { data: media, error: mediaError } = await supabase
    .from("rc_media")
    .select("object_path")
    .eq("article_id", id);
  failIfError(mediaError, returnPath, "Could not delete");
  const paths = (media ?? []).map((row) => row.object_path);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(RESOURCES_MEDIA_BUCKET)
      .remove(paths);
    if (storageError)
      failWith(returnPath, `Could not delete its screenshots: ${storageError.message}`);
  }

  const { data: deleted, error } = await supabase
    .from("rc_articles")
    .delete()
    .eq("id", id)
    .select("id");
  failIfError(error, returnPath, "Could not delete");
  if (!deleted || deleted.length === 0) failWith(returnPath, "You can't delete this article.");

  await logAuditEvent({
    actorId: profile.id,
    action: "rc.article.deleted",
    targetType: "rc_article",
    targetId: id,
    metadata: { kind: existing.kind, slug: existing.slug },
  });
  revalidatePath("/resources", "layout");
  redirect("/resources?deleted=1");
}
