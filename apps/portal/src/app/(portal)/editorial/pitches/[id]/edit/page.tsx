import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import { getPitchValues, listPitchFormFields, unwrapRead } from "@/lib/editorial/data";
import { PitchForm } from "../../pitch-form";
import type { EpFieldValue } from "@/lib/database.types";

export default async function EditPitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile, role } = await requireEditorialAccess();
  const { id } = await params;
  const supabase = await createClient();

  const pitch = unwrapRead(
    await supabase.from("ep_pitches").select("*").eq("id", id).maybeSingle(),
    "the pitch",
  );
  if (!pitch) notFound();

  // Same edit rule the RLS policy enforces: submitter while open and not on an
  // active slate, or an editor.
  const activeRounds = unwrapRead(
    await supabase.from("ep_meeting_pitches").select("id, meeting_id").eq("pitch_id", pitch.id),
    "the review history",
  );
  let underReview = false;
  if (activeRounds && activeRounds.length > 0) {
    const meetings = unwrapRead(
      await supabase
        .from("ep_meetings")
        .select("id, status")
        .in(
          "id",
          activeRounds.map((round) => round.meeting_id),
        ),
      "the meetings",
    );
    underReview = (meetings ?? []).some((meeting) => meeting.status !== "concluded");
  }
  const canEdit =
    role === "editor" ||
    (pitch.submitted_by === profile.id && pitch.status === "open" && !underReview);
  if (!canEdit) redirect(`/editorial/pitches/${pitch.id}`);

  const [fields, valuesByPitch] = await Promise.all([
    listPitchFormFields(),
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
      <PageHeader
        className="mb-5"
        back={{ href: `/editorial/pitches/${pitch.id}`, label: "Back to pitch" }}
        title="Edit pitch"
      />
      <Card>
        <div className="p-5">
          <PitchForm
            fields={fields}
            pitchId={pitch.id}
            initialTitle={pitch.title}
            initialValues={initialValues}
            cancelHref={`/editorial/pitches/${pitch.id}`}
          />
        </div>
      </Card>
    </div>
  );
}
