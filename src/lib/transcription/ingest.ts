import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getSignedMediaUrlForIngest } from "@/lib/transcription/storage";
import { getTranscriptionProvider } from "@/lib/transcription/asr";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Kicking a project's source media into the ASR pipeline.
 *
 * Extracted from src/app/(portal)/transcription/actions.ts, where it lived as a
 * private helper shared by upload-completion and manual retry. It moved here
 * when Audience Listening needed the same thing for its transcription handoff:
 * "reuse or extend the existing transcription-ingest logic rather than
 * duplicating provider calls" is only meaningful if there is one place the
 * provider is actually called from. Behaviour is unchanged.
 */

/** The RLS-scoped server client, exactly as its callers already hold it. */
type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Strips URLs out of a provider error before it's persisted or logged. The
 * signed ingest URL we hand the ASR provider is a six-hour read credential for
 * the source media, and providers routinely echo the offending request back in
 * their error text — error_message is rendered on the project screen, so it
 * must not become a place that token gets written down.
 */
export function redactUrls(message: string): string {
  return message.replace(/https?:\/\/\S+/gi, "[url]");
}

/**
 * Starts transcription for a project whose source media is already in Storage,
 * and updates the row accordingly. Callers already know the project has a valid
 * media_storage_path/media_content_type before calling this.
 */
export async function startTranscriptionForProject(
  supabase: Client,
  params: { projectId: string; storagePath: string },
): Promise<{ error?: string }> {
  const mediaUrl = await getSignedMediaUrlForIngest(params.storagePath);
  const webhookSecret = process.env.TRANSCRIPTION_WEBHOOK_SECRET;

  // Name the specific missing piece. These are variable *names*, never values,
  // and only tool members reach this screen — worth surfacing, because an
  // unset ASSEMBLYAI_API_KEY otherwise threw inside the try below and arrived
  // as the same "please try again" as a genuine provider outage.
  if (!process.env.ASSEMBLYAI_API_KEY || !webhookSecret) {
    const missing = [
      !process.env.ASSEMBLYAI_API_KEY && "ASSEMBLYAI_API_KEY",
      !webhookSecret && "TRANSCRIPTION_WEBHOOK_SECRET",
    ].filter((name): name is string => Boolean(name));
    const message = `Transcription isn't configured yet (missing ${missing.join(" and ")}).`;
    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }

  if (!mediaUrl) {
    const message = "Couldn't read the uploaded media file. Please re-upload.";
    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }

  try {
    const providerJobId = await getTranscriptionProvider().startTranscription({
      mediaUrl,
      webhookUrl: `${getSiteUrl()}/api/transcription/webhook`,
      webhookSecret,
    });

    await supabase
      .from("tw_projects")
      .update({
        status: "processing",
        transcription_provider_job_id: providerJobId,
        error_message: null,
      })
      .eq("id", params.projectId);

    return {};
  } catch (error) {
    // Surface the provider's actual complaint rather than a generic retry
    // prompt — same as the webhook handler does on the finishing side. A bare
    // "please try again" made a rejected request parameter look identical to a
    // transient blip, which is how an always-failing kickoff went unexplained.
    const reason = redactUrls(error instanceof Error ? error.message : String(error));
    const message = `Could not start transcription: ${reason}`;

    console.error("[transcription] startTranscription failed", {
      projectId: params.projectId,
      error: reason,
    });

    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }
}
