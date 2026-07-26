"use server";

import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { splitTiming } from "@/lib/transcription/transcript";

// Transcript-correction actions for a single project: speaker naming,
// per-segment reassignment, inline text edits, and split/merge (see
// docs/transcription-workspace-design.md Phase 3). All of these are
// full-member CRUD on tw_speakers/tw_segments per the shared-workspace RLS
// policies from the schema migration — no per-row ownership check here,
// matching that model. Kept separate from the parent route's actions.ts,
// which owns project lifecycle (upload/transcription/delete) rather than
// transcript content.

async function assertTranscriptionAccess() {
  await assertToolAccess("transcription");
  return createClient();
}

export async function renameSpeaker(input: {
  speakerId: string;
  displayName: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();
  const displayName = input.displayName.trim();

  const { error } = await supabase
    .from("tw_speakers")
    .update({ display_name: displayName || null })
    .eq("id", input.speakerId);

  if (error) return { error: "Could not save the speaker name." };
  return {};
}

export async function reassignSegmentSpeaker(input: {
  segmentId: string;
  speakerId: string | null;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { error } = await supabase
    .from("tw_segments")
    .update({ speaker_id: input.speakerId })
    .eq("id", input.segmentId);

  if (error) return { error: "Could not reassign that line." };
  return {};
}

/** A segment can't be saved empty — merging it with a neighbor is the sanctioned way to remove its content. */
export async function updateSegmentText(input: {
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

  if (error) return { error: "Could not save the correction." };
  return {};
}

/**
 * Splits a segment into two at a character offset into its text. Timing is
 * a proportional approximation, not a re-alignment against word timings —
 * see splitTiming's comment. Shifts every later segment's position by +1
 * first (via RPC — see the ordering migration) to make room, then inserts
 * the new second half.
 */
export async function splitSegment(input: {
  segmentId: string;
  splitAtChar: number;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { data: segment } = await supabase
    .from("tw_segments")
    .select("id, project_id, position, start_ms, end_ms, text, speaker_id")
    .eq("id", input.segmentId)
    .maybeSingle();
  if (!segment) return { error: "That line no longer exists." };

  if (input.splitAtChar <= 0 || input.splitAtChar >= segment.text.length) {
    return { error: "Place your cursor inside the text to split there." };
  }

  const firstText = segment.text.slice(0, input.splitAtChar).trim();
  const secondText = segment.text.slice(input.splitAtChar).trim();
  if (!firstText || !secondText) {
    return { error: "Both halves need some text — try a different split point." };
  }

  const timing = splitTiming(
    segment.start_ms,
    segment.end_ms,
    input.splitAtChar,
    segment.text.length,
  );
  if (!timing) {
    return { error: "This line is too short to split." };
  }

  const { error: shiftError } = await supabase.rpc("tw_shift_segment_positions", {
    p_project_id: segment.project_id,
    after_position: segment.position,
    delta: 1,
  });
  if (shiftError) return { error: "Could not split this line. Please try again." };

  const { error: insertError } = await supabase.from("tw_segments").insert({
    project_id: segment.project_id,
    speaker_id: segment.speaker_id,
    position: segment.position + 1,
    start_ms: timing.secondStartMs,
    end_ms: segment.end_ms,
    text: secondText,
    text_edited: true,
    words: [],
  });
  if (insertError) return { error: "Could not split this line. Please try again." };

  const { error: updateError } = await supabase
    .from("tw_segments")
    .update({ text: firstText, end_ms: timing.firstEndMs, text_edited: true, words: [] })
    .eq("id", segment.id);
  if (updateError) return { error: "Could not split this line. Please try again." };

  return {};
}

/** Merges a segment with the next one by position: concatenates text, spans both timings, keeps the first segment's speaker. */
export async function mergeSegmentWithNext(input: {
  segmentId: string;
}): Promise<{ error?: string }> {
  const supabase = await assertTranscriptionAccess();

  const { data: segment } = await supabase
    .from("tw_segments")
    .select("id, project_id, position, end_ms, text")
    .eq("id", input.segmentId)
    .maybeSingle();
  if (!segment) return { error: "That line no longer exists." };

  const { data: nextSegment } = await supabase
    .from("tw_segments")
    .select("id, end_ms, text")
    .eq("project_id", segment.project_id)
    .gt("position", segment.position)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (!nextSegment) return { error: "There's nothing after this line to merge with." };

  const { error: updateError } = await supabase
    .from("tw_segments")
    .update({
      text: `${segment.text} ${nextSegment.text}`.trim(),
      end_ms: nextSegment.end_ms,
      text_edited: true,
      words: [],
    })
    .eq("id", segment.id);
  if (updateError) return { error: "Could not merge these lines." };

  await supabase.from("tw_segments").delete().eq("id", nextSegment.id);
  return {};
}
