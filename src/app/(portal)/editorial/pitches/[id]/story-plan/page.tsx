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
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
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

  if (!plan) {
    const canStart = pitch.status === "assigned" && (isEditor || isReporter);
    return (
      <div className="max-w-2xl">
        <PageHeader
          className="mb-4"
          back={{ href: `/editorial/pitches/${pitchId}`, label: "Back to pitch" }}
          title={pitch.title}
          description="No story plan yet."
        />
        {error && <Alert className="mb-4">{error}</Alert>}
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
            <Field label="Confirmed central reporting question" htmlFor="seed_question">
              <Textarea id="seed_question" name="seed_question" rows={2} />
            </Field>
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
      <PageHeader
        className="mb-4"
        back={{ href: `/editorial/pitches/${pitchId}`, label: "Back to pitch" }}
        title={pitch.title}
        badge={
          <Badge variant={plan.status === "approved" ? "accent" : "neutral"}>
            {STORY_PLAN_STATUS_LABEL[plan.status]}
          </Badge>
        }
        actions={
          <StatusControls
            pitchId={pitchId}
            plan={plan}
            isEditor={isEditor}
            isReporter={isReporter}
          />
        }
      />
      {error && <Alert className="mb-4">{error}</Alert>}

      <Alert variant="note" className="mb-5">
        Breadth of perspective here does not mean equal treatment of unequal evidence or artificial
        partisan symmetry — it means naming who is missing, why, and what would change that.
      </Alert>

      {canEdit ? (
        <form action={updateStoryPlan} className="flex flex-col gap-6">
          <input type="hidden" name="pitch_id" value={pitchId} />
          <input type="hidden" name="story_plan_id" value={plan.id} />

          <Section title="Question, value, and frame">
            <PlanField
              label="Confirmed central reporting question"
              name="central_question"
              defaultValue={plan.central_question}
            />
            <PlanField
              label="Intended public-service value"
              name="public_service_value"
              defaultValue={plan.public_service_value}
            />
            <PlanField
              label="Working frame and scope"
              name="frame_scope"
              defaultValue={plan.frame_scope}
            />
            <PlanField
              label="Deliverables / format"
              name="deliverables"
              defaultValue={plan.deliverables}
              rows={2}
            />
            <Field label="Target publication window" htmlFor="target_window">
              <Input
                id="target_window"
                name="target_window"
                defaultValue={plan.target_window ?? ""}
                maxLength={200}
              />
            </Field>
          </Section>

          <Section title="Reporting and evidence">
            <PlanField
              label="Reporting and evidence map"
              name="reporting_evidence_map"
              defaultValue={plan.reporting_evidence_map}
            />
            <PlanField
              label="Records / data needed"
              name="records_data_needed"
              defaultValue={plan.records_data_needed}
            />
            <PlanField
              label="Key claims requiring verification"
              name="key_claims_to_verify"
              defaultValue={plan.key_claims_to_verify}
            />
          </Section>

          <Section title="People and perspectives">
            <PlanField
              label="People directly affected"
              name="people_affected"
              defaultValue={plan.people_affected}
            />
            <PlanField
              label="Decision-makers / power holders"
              name="decision_makers"
              defaultValue={plan.decision_makers}
            />
            <PlanField
              label="Relevant expert and experiential sources"
              name="expert_experiential_sources"
              defaultValue={plan.expert_experiential_sources}
            />
            <PlanField
              label="Main credible interpretations or competing interests"
              name="main_interpretations"
              defaultValue={plan.main_interpretations}
            />
            <PlanField
              label="Missing-perspective assessment"
              name="missing_perspective_assessment"
              defaultValue={plan.missing_perspective_assessment}
            />
            <PlanField
              label="Source-concentration risks"
              name="source_concentration_risks"
              defaultValue={plan.source_concentration_risks}
            />
            <PlanField
              label="Framing risks"
              name="framing_risks"
              defaultValue={plan.framing_risks}
            />
          </Section>

          <Section title="Opportunity to respond">
            <PlanField
              label="Requirements and status detail"
              name="otr_requirements"
              defaultValue={plan.otr_requirements}
              rows={2}
            />
            <Field label="Status" htmlFor="otr_status">
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
            </Field>
          </Section>

          <Section title="Standards and independence">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {STANDARDS_FLAGS.map((flag) => (
                <CheckboxField
                  key={flag}
                  name="standards_flags"
                  value={flag}
                  defaultChecked={plan.standards_flags.includes(flag)}
                  label={STANDARDS_FLAG_LABEL[flag]}
                />
              ))}
            </div>
          </Section>

          <Section title="Assignment">
            <div className="flex flex-wrap gap-4">
              <Field label="Reporter" htmlFor="reporter_id">
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
              </Field>
              <Field label="Editor" htmlFor="editor_id">
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
              </Field>
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
                    <Button type="submit" variant="danger-link">
                      Remove
                    </Button>
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
            <Field label="New milestone" htmlFor="label" className="flex-1">
              <Input
                id="label"
                name="label"
                maxLength={200}
                placeholder="e.g. First interview scheduled"
              />
            </Field>
            <Field label="Target date" htmlFor="target_date">
              <Input id="target_date" name="target_date" type="date" className="w-40" />
            </Field>
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

function PlanField({
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
    <Field label={label} htmlFor={name}>
      <Textarea id={name} name={name} rows={rows} defaultValue={defaultValue ?? ""} />
    </Field>
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
