import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { getPitchValues, listFormFields } from "@/lib/editorial/data";
import { PitchForm } from "../../pitch-form";
import type { EpFieldValue } from "@/lib/database.types";

export default async function EditPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const supabase = await createClient();

  const { data: pitch } = await supabase.from("ep_pitches").select("*").eq("id", id).maybeSingle();
  if (!pitch) notFound();

  // Same edit rule the RLS policy enforces: submitter while open and not on an
  // active slate, or an editor.
  const { data: activeRounds } = await supabase
    .from("ep_meeting_pitches")
    .select("id, meeting_id")
    .eq("pitch_id", pitch.id);
  let underReview = false;
  if (activeRounds && activeRounds.length > 0) {
    const { data: meetings } = await supabase
      .from("ep_meetings")
      .select("id, status")
      .in(
        "id",
        activeRounds.map((round) => round.meeting_id),
      );
    underReview = (meetings ?? []).some((meeting) => meeting.status !== "concluded");
  }
  const canEdit =
    role === "editor" ||
    (pitch.submitted_by === profile.id && pitch.status === "open" && !underReview);
  if (!canEdit) redirect(`/editorial/pitches/${pitch.id}`);

  const [fields, valuesByPitch] = await Promise.all([
    listFormFields({ activeOnly: true }),
    getPitchValues([pitch.id]),
  ]);
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const initialValues: Record<string, EpFieldValue> = {};
  for (const row of valuesByPitch.get(pitch.id) ?? []) {
    const field = fieldById.get(row.field_id);
    if (field) initialValues[field.key] = row.value;
  }

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <Link
          href={`/editorial/pitches/${pitch.id}`}
          className="text-xs font-semibold text-brand-link"
        >
          ← Back to pitch
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          Edit pitch
        </div>
        <div className="p-5">
          <PitchForm
            fields={fields}
            pitchId={pitch.id}
            initialTitle={pitch.title}
            initialValues={initialValues}
            cancelHref={`/editorial/pitches/${pitch.id}`}
          />
        </div>
      </div>
    </div>
  );
}
