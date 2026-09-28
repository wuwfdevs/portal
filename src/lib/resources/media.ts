import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { figureMediaIds, parseRichText } from "@/lib/rich-text";
import type { FigureImage } from "@/components/ui/rich-text";
import { RESOURCES_MEDIA_BUCKET } from "./screenshot-rules";

/** Signed URLs outlive a page view comfortably; a page is re-rendered on every visit. */
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * The images a set of bodies' figures point at, keyed by media id, with a
 * signed URL for each object the caller can read. A figure whose row is
 * missing, whose object has not been captured or uploaded yet, or whose
 * object the caller can't sign simply has no entry, and the renderer shows
 * its alt text in a placeholder instead of a broken image.
 */
export async function resolveFigures(bodies: unknown[]): Promise<Map<string, FigureImage>> {
  const ids = [
    ...new Set(
      bodies.flatMap((body) => {
        const doc = parseRichText(body, { allowFigures: true });
        return doc ? figureMediaIds(doc) : [];
      }),
    ),
  ];
  const figures = new Map<string, FigureImage>();
  if (ids.length === 0) return figures;

  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase.from("rc_media").select("id, object_path, width, height").in("id", ids),
      "screenshots",
    ) ?? [];
  const ready = rows.filter((row) => row.width && row.height);
  if (ready.length === 0) return figures;

  const { data: signed, error } = await supabase.storage
    .from(RESOURCES_MEDIA_BUCKET)
    .createSignedUrls(
      ready.map((row) => row.object_path),
      SIGNED_URL_SECONDS,
    );
  if (error) {
    // Not fatal: every figure falls back to its placeholder, which still
    // names what the screenshot shows. Logged so it isn't invisible.
    console.error("Could not sign screenshot URLs:", error);
    return figures;
  }

  const urlByPath = new Map(
    (signed ?? []).flatMap((entry) =>
      entry.signedUrl && entry.path ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
  for (const row of ready) {
    const url = urlByPath.get(row.object_path);
    if (url && row.width && row.height) {
      figures.set(row.id, { url, width: row.width, height: row.height });
    }
  }
  return figures;
}
