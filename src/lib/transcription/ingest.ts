import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getPrimarySourceForProject } from "@/lib/transcription/projects";
import { getSignedMediaUrlForIngest } from "@/lib/transcription/storage";
import { getTranscriptionProvider } from "@/lib/transcription/asr";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Creating a project and kicking its source media into the ASR pipeline.
 *
 * Extracted from src/app/(portal)/transcription/actions.ts, where it lived as a
 * private helper shared by upload-completion and manual retry. It moved here
 * when Audience Listening needed the same thing for its transcription handoff:
 * "reuse or extend the existing transcription-ingest logic rather than
 * duplicating provider calls" is only meaningful if there is one place the
 * provider is actually called from. Behaviour is unchanged by the Source/
 * Representation split — this is still the one place a tw_projects row (now
 * with its sw_sources + sw_representations siblings) gets created and the one
 * place the provider gets invoked from.
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

export interface CreateProjectWithSourceInput {
  title: string;
  description: string | null;
  interviewDate: string | null;
  createdBy: string;
}

export interface CreatedProjectSource {
  projectId: string;
  sourceId: string;
}

/**
 * Creates the project, its source, and the (nullable-until-ready) transcript
 * representation together — the three rows Sourcework split the old
 * tw_projects 1:1 model into. Best-effort cleanup on a partial failure: there
 * is no cross-table transaction available here, so a later insert failing
 * removes the rows already created rather than leaving an orphan.
 */
export async function createProjectWithSource(
  supabase: Client,
  input: CreateProjectWithSourceInput,
): Promise<CreatedProjectSource | { error: string }> {
  const { data: project, error: projectError } = await supabase
    .from("tw_projects")
    .insert({ title: input.title, description: input.description, created_by: input.createdBy })
    .select("id")
    .single();
  if (projectError || !project) {
    return { error: projectError?.message ?? "Could not create the project." };
  }

  const { data: source, error: sourceError } = await supabase
    .from("sw_sources")
    .insert({
      title: input.title,
      interview_date: input.interviewDate,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (sourceError || !source) {
    await supabase.from("tw_projects").delete().eq("id", project.id);
    return { error: sourceError?.message ?? "Could not create the source." };
  }

  const { error: linkError } = await supabase
    .from("sw_project_sources")
    .insert({ project_id: project.id, source_id: source.id, added_by: input.createdBy });
  if (linkError) {
    await supabase.from("sw_sources").delete().eq("id", source.id);
    await supabase.from("tw_projects").delete().eq("id", project.id);
    return { error: linkError.message };
  }

  const { error: representationError } = await supabase
    .from("sw_representations")
    .insert({ source_id: source.id, kind: "transcript", status: "pending" });
  if (representationError) {
    await supabase.from("sw_sources").delete().eq("id", source.id);
    await supabase.from("tw_projects").delete().eq("id", project.id);
    return { error: representationError.message };
  }

  return { projectId: project.id, sourceId: source.id };
}

/**
 * Starts transcription for a project whose source media is already in
 * Storage, and updates the transcript representation row accordingly.
 * Callers already know the source has a valid original_storage_path/
 * original_content_type before calling this.
 */
export async function startTranscriptionForProject(
  supabase: Client,
  params: { projectId: string; storagePath: string },
): Promise<{ error?: string }> {
  const ref = await getPrimarySourceForProject(supabase, params.projectId);
  if (!ref?.representationId) {
    return { error: "This project has no transcript representation yet." };
  }
  const representationId = ref.representationId;

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
      .from("sw_representations")
      .update({ status: "failed", error_message: message })
      .eq("id", representationId);
    return { error: message };
  }

  if (!mediaUrl) {
    const message = "Couldn't read the uploaded media file. Please re-upload.";
    await supabase
      .from("sw_representations")
      .update({ status: "failed", error_message: message })
      .eq("id", representationId);
    return { error: message };
  }

  try {
    const providerJobId = await getTranscriptionProvider().startTranscription({
      mediaUrl,
      webhookUrl: `${getSiteUrl()}/api/transcription/webhook`,
      webhookSecret,
    });

    await supabase
      .from("sw_representations")
      .update({
        status: "processing",
        provider_job_id: providerJobId,
        error_message: null,
      })
      .eq("id", representationId);

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
      .from("sw_representations")
      .update({ status: "failed", error_message: message })
      .eq("id", representationId);
    return { error: message };
  }
}
