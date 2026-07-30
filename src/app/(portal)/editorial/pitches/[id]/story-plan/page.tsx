import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireEditorialAccess } from "@/lib/editorial/access";
import {
  getProfileNames,
  getStoryPlan,
  listMembers,
  listStoryPlanMilestones,
  unwrapRead,
} from "@/lib/editorial/data";
import {
  OTR_STATUS_LABEL,
  OTR_STATUSES,
  STANDARDS_FLAG_LABEL,
  STANDARDS_FLAGS,
  STORY_PLAN_STATUS_LABEL,
} from "@/lib/editorial/story-plan";
import { formatDate } from "@/lib/editorial/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  addMilestone,
  createStoryPlan,
  deleteMilestone,
  toggleMilestone,
  transitionStoryPlanStatus,
  updateStoryPlan,
} from "./actions";

export default async function StoryPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile, role } = await requireEditorialAccess();
  const { id: pitchId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const pitch = unwrapRead(
    await supabase.from("ep_pitches").select("*").eq("id", pitchId).maybeSingle(),
    "the pitch",
  );
  if (!pitch) notFound();

  const [plan, members] = await Promise.all([getStoryPlan(pitchId), listMembers()]);
  const isEditor = role === "editor";
  const isReporter = pitch.assigned_to === profile.id;

  const backLink = (
    <div className="mb-4">
      <Link
        href={`/editorial/pitches/${pitchId}`}
        className="text-xs font-semibold text-brand-link hover:underline"
      >
        ← Back to pitch
      </Link>
    </div>
  );

  if (!plan) {
    const canStart = pitch.status === "assigned" && (isEditor || isReporter);
    return (
      <div className="max-w-2xl">
        {backLink}
        {error && <Alert className="mb-4">{error}</Alert>}
        <h2 className="mb-1 font-serif text-[19px] font-bold text-ink-900">{pitch.title}</h2>
        <p className="mb-4 text-xs text-ink-400">No story plan yet.</p>
        {pitch.status !== "assigned" ? (
          <Alert variant="note">
            Story planning starts once a pitch is assigned to a reporter. This pitch is currently{" "}
            {pitch.status}.
          </Alert>
        ) : canStart ? (
          <form action={createStoryPlan} className="rounded border border-dashed border-line p-6">
            <input type="hidden" name="pitch_id" value={pitchId} />
            <p className="mb-3 text-sm leading-relaxed text-ink-500">
              Confirm the central question if it&apos;s changed since the pitch, then start
              planning. Everything else can be filled in afterward.
            </p>
            <Label htmlFor="seed_question">Confirmed central reporting question</Label>
            <Textarea id="seed_question" name="seed_question" rows={2} />
            <div className="mt-3 flex justify-end">
              <Button type="submit">Start story plan</Button>
            </div>
          </form>
        ) : (
          <Alert variant="note">
            Only the assigned reporter or an editor can start this pitch&apos;s story plan.
          </Alert>
        )}
      </div>
    );
  }

  const canEdit = isEditor || (isReporter && plan.status !== "approved");
  const milestones = await listStoryPlanMilestones(plan.id);
  const names = await getProfileNames([plan.reporter_id, plan.editor_id]);

  return (
    <div className="max-w-2xl">
      {backLink}
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-serif text-[19px] font-bold text-ink-900">{pitch.title}</h2>
        <Badge variant={plan.status === "approved" ? "accent" : "neutral"}>
          {STORY_PLAN_STATUS_LABEL[plan.status]}
        </Badge>
        <div className="flex-1" />
        <StatusControls pitchId={pitchId} plan={plan} isEditor={isEditor} isReporter={isReporter} />
      </div>

      <Alert variant="note" className="mb-5">
        Breadth of perspective here does not mean equal treatment of unequal evidence or artificial
        partisan symmetry — it means naming who is missing, why, and what would change that.
      </Alert>

      {canEdit ? (
        <form action={updateStoryPlan} className="flex flex-col gap-6">
          <input type="hidden" name="pitch_id" value={pitchId} />
          <input type="hidden" name="story_plan_id" value={plan.id} />

          <Section title="Question, value, and frame">
            <Field
              label="Confirmed central reporting question"
              name="central_question"
              defaultValue={plan.central_question}
            />
            <Field
              label="Intended public-service value"
              name="public_service_value"
              defaultValue={plan.public_service_value}
            />
            <Field
              label="Working frame and scope"
              name="frame_scope"
              defaultValue={plan.frame_scope}
            />
            <Field
              label="Deliverables / format"
              name="deliverables"
              defaultValue={plan.deliverables}
              rows={2}
            />
            <div>
              <Label htmlFor="target_window">Target publication window</Label>
              <Input
                id="target_window"
                name="target_window"
                defaultValue={plan.target_window ?? ""}
                maxLength={200}
              />
            </div>
          </Section>

          <Section title="Reporting and evidence">
            <Field
              label="Reporting and evidence map"
              name="reporting_evidence_map"
              defaultValue={plan.reporting_evidence_map}
            />
            <Field
              label="Records / data needed"
              name="records_data_needed"
              defaultValue={plan.records_data_needed}
            />
            <Field
              label="Key claims requiring verification"
              name="key_claims_to_verify"
              defaultValue={plan.key_claims_to_verify}
            />
          </Section>

          <Section title="People and perspectives">
            <Field
              label="People directly affected"
              name="people_affected"
              defaultValue={plan.people_affected}
            />
            <Field
              label="Decision-makers / power holders"
              name="decision_makers"
              defaultValue={plan.decision_makers}
            />
            <Field
              label="Relevant expert and experiential sources"
              name="expert_experiential_sources"
              defaultValue={plan.expert_experiential_sources}
            />
            <Field
              label="Main credible interpretations or competing interests"
              name="main_interpretations"
              defaultValue={plan.main_interpretations}
            />
            <Field
              label="Missing-perspective assessment"
              name="missing_perspective_assessment"
              defaultValue={plan.missing_perspective_assessment}
            />
            <Field
              label="Source-concentration risks"
              name="source_concentration_risks"
              defaultValue={plan.source_concentration_risks}
            />
            <Field label="Framing risks" name="framing_risks" defaultValue={plan.framing_risks} />
          </Section>

          <Section title="Opportunity to respond">
            <Field
              label="Requirements and status detail"
              name="otr_requirements"
              defaultValue={plan.otr_requirements}
              rows={2}
            />
            <div>
              <Label htmlFor="otr_status">Status</Label>
              <Select
                id="otr_status"
                name="otr_status"
                defaultValue={plan.otr_status}
                className="w-56"
              >
                {OTR_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {OTR_STATUS_LABEL[status]}
                  </option>
                ))}
              </Select>
            </div>
          </Section>

          <Section title="Standards and independence">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {STANDARDS_FLAGS.map((flag) => (
                <label key={flag} className="flex items-center gap-1.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="standards_flags"
                    value={flag}
                    defaultChecked={plan.standards_flags.includes(flag)}
                    className="h-4 w-4"
                  />
                  {STANDARDS_FLAG_LABEL[flag]}
                </label>
              ))}
            </div>
          </Section>

          <Section title="Assignment">
            <div className="flex flex-wrap gap-4">
              <div>
                <Label htmlFor="reporter_id">Reporter</Label>
                <Select
                  id="reporter_id"
                  name="reporter_id"
                  defaultValue={plan.reporter_id ?? ""}
                  className="w-56"
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="editor_id">Editor</Label>
                <Select
                  id="editor_id"
                  name="editor_id"
                  defaultValue={plan.editor_id ?? ""}
                  className="w-56"
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Section>

          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Save story plan</Button>
          </div>
        </form>
      ) : (
        <ReadOnlyPlan plan={plan} names={names} />
      )}

      <section className="mt-8">
        <h3 className="mb-2.5 text-sm font-bold text-ink-900">Editorial milestones</h3>
        {milestones.length === 0 ? (
          <p className="text-sm text-ink-400">No milestones yet.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1.5">
            {milestones.map((milestone) => (
              <li
                key={milestone.id}
                className="flex items-center gap-3 rounded border border-line px-3 py-2 text-sm"
              >
                {canEdit ? (
                  <form action={toggleMilestone}>
                    <input type="hidden" name="pitch_id" value={pitchId} />
                    <input type="hidden" name="milestone_id" value={milestone.id} />
                    <input
                      type="hidden"
                      name="next_completed"
                      value={(!milestone.completed).toString()}
                    />
                    <button
                      type="submit"
                      aria-label={milestone.completed ? "Mark incomplete" : "Mark complete"}
                      className="h-4 w-4 rounded border border-line"
                      style={{ background: milestone.completed ? "currentColor" : undefined }}
                    />
                  </form>
                ) : (
                  <span
                    className={`h-4 w-4 rounded border border-line ${milestone.completed ? "bg-ink-500" : ""}`}
                  />
                )}
                <span
                  className={
                    milestone.completed ? "flex-1 text-ink-400 line-through" : "flex-1 text-ink-900"
                  }
                >
                  {milestone.label}
                </span>
                {milestone.target_date && (
                  <span className="text-xs text-ink-400">{formatDate(milestone.target_date)}</span>
                )}
                {canEdit && (
                  <form action={deleteMilestone}>
                    <input type="hidden" name="pitch_id" value={pitchId} />
                    <input type="hidden" name="milestone_id" value={milestone.id} />
                    <button
                      type="submit"
                      className="text-xs font-semibold text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <form action={addMilestone} className="flex flex-wrap items-end gap-2.5">
            <input type="hidden" name="pitch_id" value={pitchId} />
            <input type="hidden" name="story_plan_id" value={plan.id} />
            <div className="flex-1">
              <Label htmlFor="label">New milestone</Label>
              <Input
                id="label"
                name="label"
                maxLength={200}
                placeholder="e.g. First interview scheduled"
              />
            </div>
            <div>
              <Label htmlFor="target_date">Target date</Label>
              <Input id="target_date" name="target_date" type="date" className="w-40" />
            </div>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-sm font-bold text-ink-900">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
  rows?: number;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={rows} defaultValue={defaultValue ?? ""} />
    </div>
  );
}

function StatusControls({
  pitchId,
  plan,
  isEditor,
  isReporter,
}: {
  pitchId: string;
  plan: {
    id: string;
    status: "draft" | "ready_for_editor" | "approved";
    reporter_id: string | null;
  };
  isEditor: boolean;
  isReporter: boolean;
}) {
  const transition = (
    to: string,
    label: string,
    variant: "primary" | "secondary" = "secondary",
  ) => (
    <form action={transitionStoryPlanStatus} key={to}>
      <input type="hidden" name="pitch_id" value={pitchId} />
      <input type="hidden" name="story_plan_id" value={plan.id} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant={variant === "primary" ? "primary" : "secondary"}>
        {label}
      </Button>
    </form>
  );

  const controls: React.ReactNode[] = [];
  if ((isReporter || isEditor) && plan.status === "draft") {
    controls.push(transition("ready_for_editor", "Submit for editor review", "primary"));
  }
  if ((isReporter || isEditor) && plan.status === "ready_for_editor") {
    controls.push(transition("draft", "Pull back for more work"));
  }
  if (isEditor && plan.status !== "approved") {
    controls.push(transition("approved", "Approve", "primary"));
  }
  if (isEditor && plan.status === "approved") {
    controls.push(transition("draft", "Reopen for revision"));
  }

  if (controls.length === 0) return null;
  return <div className="flex flex-wrap gap-2">{controls}</div>;
}

function ReadOnlyPlan({
  plan,
  names,
}: {
  plan: {
    reporter_id: string | null;
    editor_id: string | null;
    status: string;
  };
  names: Map<string, string>;
}) {
  return (
    <Alert variant="note">
      This plan is{" "}
      {plan.status === "approved"
        ? "approved and read-only for you"
        : "not editable by you right now"}
      . Reporter: {plan.reporter_id ? (names.get(plan.reporter_id) ?? "—") : "unassigned"}. Editor:{" "}
      {plan.editor_id ? (names.get(plan.editor_id) ?? "—") : "unassigned"}.
    </Alert>
  );
}
