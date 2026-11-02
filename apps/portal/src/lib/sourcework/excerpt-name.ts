import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composeExcerptName } from "@/lib/transcription/excerpt-title";
import { speakerLabels } from "./piece-queries";

// Stores an excerpt's whole name, Story_Speaker_Quote, as its title once it exists: the speaker is
// found from the transcript under the excerpt's own range, so it can only be known after the row is
// written. Best effort. If anything fails the excerpt keeps the quote-only title it was created
// with, and the download still adds story and speaker to the file name.
export async function storeFullExcerptName(
  supabase: SupabaseClient,
  args: { excerptId: string; projectId: string | null; quote: string },
): Promise<string> {
  try {
    const [project, speakers] = await Promise.all([
      args.projectId
        ? supabase.from("tw_projects").select("title").eq("id", args.projectId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      speakerLabels(supabase, [args.excerptId]),
    ]);
    if (project.error) throw project.error;
    const name = composeExcerptName(
      project.data?.title ?? "",
      speakers.get(args.excerptId) ?? null,
      args.quote,
    );
    if (name === args.quote) return name;
    const { error } = await supabase
      .from("sw_source_excerpts")
      .update({ title: name })
      .eq("id", args.excerptId);
    if (error) throw error;
    return name;
  } catch (error) {
    console.error("Could not store the excerpt's full name:", error);
    return args.quote;
  }
}
