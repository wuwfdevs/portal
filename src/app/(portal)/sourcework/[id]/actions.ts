"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import {
  parseWords,
  partitionWords,
  splitTiming,
  splitTimingFromWords,
} from "@/lib/transcription/transcript";

// Transcript-correction actions for a single project: speaker naming,
// per-segment reassignment, inline text edits, and split/merge (see
// docs/transcription-workspace-design.md Phase 3). All of these are
// full-member CRUD on tw_speakers/tw_segments per the shared-workspace RLS
// policies from the schema migration — no per-row ownership check here,
// matching that model. Kept separate from the parent route's actions.ts,
// which owns project lifecycle (upload/transcription/delete) rather than
// transcript content.
//
// Every one of these takes projectId and revalidates the workspace on the
// way out. Without that, a mutation leaves Next's client router cache
// holding the pre-edit transcript, so navigating away and back silently
// resurrects old text.

async function assertTranscriptionAccess() {
  await assertToolAccess("transcription");
  return createClient();
}

/** `projectId` is null for a source that is in no project; its own screen is what needs refreshing then. */
function revalidateProject(projectId: string | null) {
  if (projectId) revalidatePath(`/sourcework/${projectId}`);
  else revalidatePath("/sourcework/sources/[id]", "page");
}

export async function renameSpeaker(input: {
  projectId: string | null;
  speakerId: string;
  displayName: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();
  const displayName = input.displayName.trim();

  const { error } = await supabase
    .from("tw_speakers")
    .update({ display_name: displayName || null })
    .eq("id", input.speakerId);

  if (error) {
    console.error("Could not save the speaker name:", error);
    return { error: "Could not save the speaker name." };
  }
  revalidateProject(input.projectId);
  return {};
}

/**
 * Folds one speaker into another: every line of `fromSpeakerId` moves to
 * `intoSpeakerId`, then the emptied speaker is removed. Diarization often
 * splits one person into two or three, and in a long public meeting into
 * many; this is the repair, one click per stray voice instead of reassigning
 * every line by hand. Both speakers must belong to the same transcript, which
 * is checked here rather than trusted from the client.
 */
export async function mergeSpeakers(input: {
  projectId: string | null;
  fromSpeakerId: string;
  intoSpeakerId: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();
  if (input.fromSpeakerId === input.intoSpeakerId) {
    return { error: "Choose a different speaker to merge into." };
  }

  const { data: speakers, error: readError } = await supabase
    .from("tw_speakers")
    .select("id, representation_id")
    .in("id", [input.fromSpeakerId, input.intoSpeakerId]);
  if (readError || !speakers || speakers.length !== 2) {
    return { error: "Could not find those speakers." };
  }
  if (speakers[0]!.representation_id !== speakers[1]!.representation_id) {
    return { error: "Those speakers belong to different transcripts." };
  }

  const { error: moveError } = await supabase
    .from("tw_segments")
    .update({ speaker_id: input.intoSpeakerId })
    .eq("speaker_id", input.fromSpeakerId);
  if (moveError) {
    console.error("Could not move that speaker's lines:", moveError);
    return { error: "Could not move that speaker's lines." };
  }

  const { data: removedSpeaker, error: deleteError } = await supabase
    .from("tw_speakers")
    .delete()
    .eq("id", input.fromSpeakerId)
    .select("id");
  if (deleteError || !removedSpeaker?.length) {
    console.error("Moved the lines, but could not remove the old speaker:", deleteError);
    return { error: "Moved the lines, but could not remove the old speaker." };
  }

  revalidateProject(input.projectId);
  return {};
}

export async function reassignSegmentSpeaker(input: {
  projectId: string | null;
  segmentId: string;
  speakerId: string | null;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { error } = await supabase
    .from("tw_segments")
    .update({ speaker_id: input.speakerId })
    .eq("id", input.segmentId);

  if (error) {
    console.error("Could not reassign that line:", error);
    return { error: "Could not reassign that line." };
  }
  revalidateProject(input.projectId);
  return {};
}

/**
 * A segment can't be saved empty — merging it with a neighbor is the
 * sanctioned way to remove its content. `words` is deliberately left in
 * place: text_edited is the flag that marks its timings approximate, and
 * approximate anchors still beat no anchors for clip selection (see
 * docs/transcription-workspace-design.md §5).
 */
export async function updateSegmentText(input: {
  projectId: string | null;
  segmentId: string;
  text: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();
  const text = input.text.trim();

  if (!text) {
    return { error: "A line can't be empty — merge it with a neighbor instead." };
  }

  const { error } = await supabase
    .from("tw_segments")
    .update({ text, text_edited: true })
    .eq("id", input.segmentId);

  if (error) {
    console.error("Could not save the correction:", error);
    return { error: "Could not save the correction." };
  }
  revalidateProject(input.projectId);
  return {};
}

/**
 * Splits a segment into two at a character offset into its text. Shifts
 * every later segment's position by +1 first (via RPC — see the ordering
 * migration) to make room, then inserts the new second half.
 *
 * Word timings are partitioned between the halves rather than discarded:
 * throwing them away used to cost the whole transcript its word-level
 * anchors after a single split, which is what clip selection snaps to. With
 * the words kept, the cut lands exactly in the gap between the last word of
 * the first half and the first word of the second; splitTiming's
 * character-ratio estimate is only the fallback for segments whose words
 * are already gone.
 */
export async function splitSegment(input: {
  projectId: string | null;
  segmentId: string;
  splitAtChar: number;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { data: segment, error: segmentError } = await supabase
    .from("tw_segments")
    .select(
      "id, representation_id, position, start_ms, end_ms, text, text_edited, speaker_id, words",
    )
    .eq("id", input.segmentId)
    .maybeSingle();
  if (segmentError) {
    console.error("Could not read the line to split:", segmentError);
    return { error: "Could not split this line. Please try again." };
  }
  if (!segment) return { error: "That line no longer exists." };

  if (input.splitAtChar <= 0 || input.splitAtChar >= segment.text.length) {
    return { error: "Place your cursor inside the text to split there." };
  }

  const firstText = segment.text.slice(0, input.splitAtChar).trim();
  const secondText = segment.text.slice(input.splitAtChar).trim();
  if (!firstText || !secondText) {
    return { error: "Both halves need some text — try a different split point." };
  }

  const words = partitionWords(parseWords(segment.words), input.splitAtChar, segment.text);
  const timing =
    splitTimingFromWords(words.first, words.second, segment.start_ms, segment.end_ms) ??
    splitTiming(segment.start_ms, segment.end_ms, input.splitAtChar, segment.text.length);
  if (!timing) {
    return { error: "This line is too short to split." };
  }

  const { error: shiftError } = await supabase.rpc("tw_shift_segment_positions", {
    p_representation_id: segment.representation_id,
    after_position: segment.position,
    delta: 1,
  });
  if (shiftError) {
    console.error("Could not split this line. Please try again:", shiftError);
    return { error: "Could not split this line. Please try again." };
  }

  const { error: insertError } = await supabase.from("tw_segments").insert({
    representation_id: segment.representation_id,
    speaker_id: segment.speaker_id,
    position: segment.position + 1,
    start_ms: timing.secondStartMs,
    end_ms: segment.end_ms,
    text: secondText,
    text_edited: segment.text_edited,
    words: words.second,
  });
  if (insertError) {
    console.error("Could not split this line. Please try again:", insertError);
    return { error: "Could not split this line. Please try again." };
  }

  const { error: updateError } = await supabase
    .from("tw_segments")
    .update({ text: firstText, end_ms: timing.firstEndMs, words: words.first })
    .eq("id", segment.id);
  if (updateError) {
    console.error("Could not split this line. Please try again:", updateError);
    return { error: "Could not split this line. Please try again." };
  }

  revalidateProject(input.projectId);
  return {};
}

/**
 * Merges a segment with the next one by position: concatenates text and
 * word timings, spans both timings, keeps the first segment's speaker.
 * Neither half's words are lost, so a merge is as reversible (by splitting
 * again) as the timings allow.
 */
export async function mergeSegmentWithNext(input: {
  projectId: string | null;
  segmentId: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { data: segment, error: segmentError } = await supabase
    .from("tw_segments")
    .select("id, representation_id, position, end_ms, text, text_edited, words")
    .eq("id", input.segmentId)
    .maybeSingle();
  if (segmentError) {
    console.error("Could not read the line to merge:", segmentError);
    return { error: "Could not merge these lines." };
  }
  if (!segment) return { error: "That line no longer exists." };

  const { data: nextSegment, error: nextError } = await supabase
    .from("tw_segments")
    .select("id, end_ms, text, text_edited, words")
    .eq("representation_id", segment.representation_id)
    .gt("position", segment.position)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (nextError) {
    console.error("Could not read the next line to merge:", nextError);
    return { error: "Could not merge these lines." };
  }
  if (!nextSegment) return { error: "There's nothing after this line to merge with." };

  const { error: updateError } = await supabase
    .from("tw_segments")
    .update({
      text: `${segment.text} ${nextSegment.text}`.trim(),
      end_ms: nextSegment.end_ms,
      text_edited: segment.text_edited || nextSegment.text_edited,
      words: [...parseWords(segment.words), ...parseWords(nextSegment.words)],
    })
    .eq("id", segment.id);
  if (updateError) {
    console.error("Could not merge these lines:", updateError);
    return { error: "Could not merge these lines." };
  }

  const { data: removedSegment, error: deleteError } = await supabase
    .from("tw_segments")
    .delete()
    .eq("id", nextSegment.id)
    .select("id");
  if (deleteError || !removedSegment?.length) {
    console.error("Merged, but the old line is still there. Reload the page:", deleteError);
    return { error: "Merged, but the old line is still there. Reload the page." };
  }

  revalidateProject(input.projectId);
  return {};
}
