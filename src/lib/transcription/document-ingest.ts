import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { TRANSCRIPTION_MEDIA_BUCKET } from "@/lib/transcription/media";
import { getSignedMediaUrlForIngest } from "@/lib/transcription/storage";
import { extractNativeDocumentText } from "@/lib/transcription/providers/native-pdf";
import { getDocumentOcrProvider } from "@/lib/transcription/document-ocr";
import { isStaleProcessingRun } from "@/lib/transcription/document-normalization";
import { redactUrls } from "@/lib/transcription/ingest";
import { reindexRepresentation } from "@/lib/transcription/indexing";
import type { NormalizedDocumentResult } from "@/lib/transcription/document-provider";
import { after } from "next/server";

// Sourcework's document-processing pipeline (docs/sourcework-design.md §8.6):
// native PDF text extraction, falling back to Mistral OCR when the PDF's own
// text layer isn't adequate — both writing into the same normalized
// sw_document_pages/sw_document_blocks shape. An explicit, typed pipeline,
// not a stretched transcript-specific function — see design doc §2's
// "developer-authored pipelines" constraint.

type Client = Awaited<ReturnType<typeof createClient>>;

const MAX_ATTEMPT_LOOKUP = 1000;

/**
 * Starts (or restarts) document processing for a representation whose
 * source media is already in Storage. Idempotent: a fresh in-flight run is
 * left alone (a friendly no-op, not an error); a stuck one (see
 * isStaleProcessingRun) is marked failed so a new attempt can start —
 * without this, sw_document_processing_runs_one_active_idx would
 * permanently block retrying a document whose processing run died without
 * writing its own failure. See design doc §8.6.
 */
export async function startDocumentProcessing(
  supabase: Client,
  params: { representationId: string; sourceId: string; storagePath: string },
): Promise<{ error?: string }> {
  const { representationId, sourceId, storagePath } = params;

  const { data: activeRun } = await supabase
    .from("sw_document_processing_runs")
    .select("id, started_at")
    .eq("representation_id", representationId)
    .eq("status", "processing")
    .maybeSingle();

  if (activeRun) {
    if (!isStaleProcessingRun(activeRun.started_at)) {
      return {}; // already in flight — nothing to do.
    }
    await supabase
      .from("sw_document_processing_runs")
      .update({
        status: "failed",
        error_message: "Processing appears to have stalled.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", activeRun.id);
  }

  const { count } = await supabase
    .from("sw_document_processing_runs")
    .select("id", { count: "exact", head: true })
    .eq("representation_id", representationId)
    .limit(MAX_ATTEMPT_LOOKUP);
  const attempt = (count ?? 0) + 1;

  const { data: file, error: downloadError } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .download(storagePath);
  if (downloadError || !file) {
    const message = "Couldn't read the uploaded document. Please re-upload.";
    await supabase
      .from("sw_representations")
      .update({ status: "failed", error_message: message })
      .eq("id", representationId);
    return { error: message };
  }

  let native: Awaited<ReturnType<typeof extractNativeDocumentText>>;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    native = await extractNativeDocumentText(bytes);
  } catch (error) {
    const message = `Could not read this PDF: ${error instanceof Error ? error.message : String(error)}`;
    await supabase
      .from("sw_representations")
      .update({ status: "failed", error_message: message })
      .eq("id", representationId);
    return { error: message };
  }

  if (native.adequate) {
    const { error: runError } = await supabase.from("sw_document_processing_runs").insert({
      representation_id: representationId,
      attempt,
      method: "native",
      status: "processing",
    });
    if (runError) return { error: runError.message };

    await supabase
      .from("sw_representations")
      .update({ status: "processing", error_message: null })
      .eq("id", representationId);

    return finishProcessing(supabase, {
      representationId,
      sourceId,
      attempt,
      method: "native",
      provider: null,
      providerModel: null,
      result: native,
      raw: null,
    });
  }

  // Native extraction wasn't adequate — fall back to Mistral OCR. This is a
  // real external call that can take well over a minute for a large scanned
  // document, so it must not block this request or stay tied to whether the
  // reporter's browser is still connected — see design doc §8.6's execution
  // model. The run row + representation status flip happen now, before this
  // function returns; the actual OCR call and write-back happen in after(),
  // decoupled from the response already on its way to the browser.
  const { error: runError } = await supabase.from("sw_document_processing_runs").insert({
    representation_id: representationId,
    attempt,
    method: "ocr",
    provider: "mistral",
    status: "processing",
  });
  if (runError) return { error: runError.message };

  await supabase
    .from("sw_representations")
    .update({ status: "processing", error_message: null })
    .eq("id", representationId);

  after(async () => {
    try {
      const signedUrl = await getSignedMediaUrlForIngest(storagePath);
      if (!signedUrl) {
        throw new Error("Couldn't read the uploaded document. Please re-upload.");
      }
      const ocrResult = await getDocumentOcrProvider().process({ documentUrl: signedUrl });
      await finishProcessing(supabase, {
        representationId,
        sourceId,
        attempt,
        method: "ocr",
        provider: ocrResult.provider,
        providerModel: ocrResult.model,
        result: ocrResult,
        raw: ocrResult.raw,
      });
    } catch (error) {
      const reason = redactUrls(error instanceof Error ? error.message : String(error));
      const message = `Could not process this document: ${reason}`;
      console.error("[sourcework] document OCR failed", { representationId, error: reason });
      await supabase
        .from("sw_representations")
        .update({ status: "failed", error_message: message })
        .eq("id", representationId);
      await supabase
        .from("sw_document_processing_runs")
        .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
        .eq("representation_id", representationId)
        .eq("attempt", attempt);
    }
  });

  return {};
}

/**
 * Writes a successful extraction's pages/blocks (delete-then-insert — see
 * design doc §8.6 on why a reprocess is a clean slate, not a merge),
 * updates the source's page_count, flips the representation and run to
 * ready, and reindexes. Shared by both the native (synchronous) and OCR
 * (after()-deferred) paths so there is exactly one place this happens.
 */
async function finishProcessing(
  supabase: Client,
  params: {
    representationId: string;
    sourceId: string;
    attempt: number;
    method: "native" | "ocr";
    provider: string | null;
    providerModel: string | null;
    result: NormalizedDocumentResult;
    raw: unknown;
  },
): Promise<{ error?: string }> {
  const { representationId, sourceId, attempt, method, provider, providerModel, result, raw } = params;

  await supabase.from("sw_document_blocks").delete().eq("representation_id", representationId);
  await supabase.from("sw_document_pages").delete().eq("representation_id", representationId);

  const { data: pageRows, error: pageError } = await supabase
    .from("sw_document_pages")
    .insert(
      result.pages.map((page) => ({
        representation_id: representationId,
        page_number: page.pageNumber,
        width_pt: page.widthPt,
        height_pt: page.heightPt,
        rotation_degrees: page.rotationDegrees,
      })),
    )
    .select("id, page_number");
  if (pageError) return await failFinish(supabase, representationId, attempt, pageError.message);

  const pageIdByNumber = new Map((pageRows ?? []).map((row) => [row.page_number, row.id]));

  if (result.blocks.length > 0) {
    const missingPage = result.blocks.find((block) => !pageIdByNumber.has(block.pageNumber));
    if (missingPage) {
      return await failFinish(
        supabase,
        representationId,
        attempt,
        `Extraction produced a block on page ${missingPage.pageNumber} with no matching page row.`,
      );
    }

    const { error: blockError } = await supabase.from("sw_document_blocks").insert(
      result.blocks.map((block) => ({
        representation_id: representationId,
        page_id: pageIdByNumber.get(block.pageNumber)!,
        page_number: block.pageNumber,
        reading_order: block.readingOrder,
        block_type: block.blockType,
        text: block.text,
        bbox: block.bbox,
        confidence: block.confidence,
        source: block.source,
        extra: block.extra ?? {},
      })),
    );
    if (blockError) return await failFinish(supabase, representationId, attempt, blockError.message);
  }

  await supabase.from("sw_sources").update({ page_count: result.pages.length }).eq("id", sourceId);

  await supabase
    .from("sw_representations")
    .update({
      status: "ready",
      error_message: null,
      produced_by: method === "native" ? "native-pdf-text" : `${provider ?? "unknown"}-ocr`,
      config: { method, provider, model: providerModel },
    })
    .eq("id", representationId);

  await supabase
    .from("sw_document_processing_runs")
    .update({
      status: "ready",
      provider_model: providerModel,
      raw_response: raw,
      finished_at: new Date().toISOString(),
    })
    .eq("representation_id", representationId)
    .eq("attempt", attempt);

  // Same reasoning as the transcription webhook: an indexing failure must
  // not turn a document that extracted perfectly well into a failed
  // representation. Swallowed and logged — the reindex/"Rebuild search
  // index" action picks stale rows up later.
  try {
    await reindexRepresentation(supabase, representationId);
  } catch (indexError) {
    console.error("[sourcework] indexing after document processing failed", {
      representationId,
      error: indexError,
    });
  }

  return {};
}

async function failFinish(
  supabase: Client,
  representationId: string,
  attempt: number,
  message: string,
): Promise<{ error: string }> {
  await supabase
    .from("sw_representations")
    .update({ status: "failed", error_message: message })
    .eq("id", representationId);
  await supabase
    .from("sw_document_processing_runs")
    .update({ status: "failed", error_message: message, finished_at: new Date().toISOString() })
    .eq("representation_id", representationId)
    .eq("attempt", attempt);
  return { error: message };
}
