"use client";

import { RichTextField } from "@/components/ui/rich-text-field";
import type { FigureUploadResult } from "@/components/ui/rich-text-editor";
import { createClient } from "@/lib/supabase/client";
import {
  RESOURCES_MEDIA_BUCKET,
  screenshotObjectPath,
  validateScreenshot,
} from "@/lib/resources/screenshot-rules";
import { removeUploadedObject, uploadObject } from "@/lib/upload-object";

const PREVIEW_SECONDS = 60 * 60;

/**
 * The body editor for a procedure or guide. With `articleId` (editing an
 * article that exists) it can add screenshots: the file goes browser →
 * Storage directly at `<article_id>/<media_id>.<ext>`, never through a
 * Server Action, then an rc_media row records it, and only then is the
 * figure node inserted. Both writes are editor-only in RLS. Without an
 * article id (creating one) there's nowhere to file an upload yet.
 */
export function ArticleBodyField({
  defaultValue,
  articleId,
  previewUrls,
}: {
  defaultValue?: unknown;
  articleId?: string;
  previewUrls?: Record<string, string>;
}) {
  async function upload(
    file: File,
    meta: { alt: string; caption: string; width: number; height: number },
  ): Promise<FigureUploadResult> {
    if (!articleId) throw new Error("Save the article first, then add screenshots.");
    const supabase = createClient();
    const mediaId = crypto.randomUUID();
    const objectPath = screenshotObjectPath(articleId, mediaId, file.type);

    const uploaded = await uploadObject({
      client: supabase,
      bucket: RESOURCES_MEDIA_BUCKET,
      path: objectPath,
      body: file,
      contentType: file.type,
      upsert: false,
    });
    if (!uploaded.ok) throw new Error(`The upload failed: ${uploaded.message}`);

    const { error: rowError } = await supabase.from("rc_media").insert({
      id: mediaId,
      article_id: articleId,
      object_path: objectPath,
      width: meta.width,
      height: meta.height,
      alt: meta.alt,
    });
    if (rowError) {
      // Don't leave an object nothing points at.
      await removeUploadedObject(supabase, RESOURCES_MEDIA_BUCKET, objectPath);
      throw new Error(`The screenshot couldn't be recorded: ${rowError.message}`);
    }

    // The preview is a nicety: if signing fails the local object URL below stands in.
    // eslint-disable-next-line no-restricted-syntax
    const { data: signed } = await supabase.storage
      .from(RESOURCES_MEDIA_BUCKET)
      .createSignedUrl(objectPath, PREVIEW_SECONDS);
    return { mediaId, previewUrl: signed?.signedUrl ?? URL.createObjectURL(file) };
  }

  return (
    <RichTextField
      name="body"
      ariaLabel="Text"
      defaultValue={defaultValue}
      minHeightClassName="min-h-[320px]"
      figures={
        articleId
          ? { previewUrls: previewUrls ?? {}, validate: validateScreenshot, upload }
          : undefined
      }
    />
  );
}
