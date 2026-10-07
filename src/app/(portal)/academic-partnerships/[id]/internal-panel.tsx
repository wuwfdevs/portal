import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  DISPOSITION_LABEL,
  DISPOSITIONS,
  STAGE_LABEL,
  STAGES,
  dispositionRequiresReason,
} from "@/lib/academic-partnerships/pipeline";
import type { SubmissionDetail } from "@/lib/academic-partnerships/queries";
import {
  assignOwner,
  reopenSubmission,
  setDisposition,
  setNextAction,
  setStageForm,
  updateAssessment,
} from "../actions";
import { SectionHeading } from "@/components/ui/section-heading";

const FIT_OPTIONS = ["strong", "possible", "weak"] as const;
const CAPACITY_OPTIONS = ["available", "uncertain", "unavailable"] as const;
const TIMING_OPTIONS = ["feasible", "requires_adjustment", "not_feasible"] as const;

const FIT_LABEL: Record<(typeof FIT_OPTIONS)[number], string> = {
  strong: "Strong",
  possible: "Possible",
  weak: "Weak",
};
const CAPACITY_LABEL: Record<(typeof CAPACITY_OPTIONS)[number], string> = {
  available: "Available",
  uncertain: "Uncertain",
  unavailable: "Unavailable",
};
const TIMING_LABEL: Record<(typeof TIMING_OPTIONS)[number], string> = {
  feasible: "Feasible",
  requires_adjustment: "Requires adjustment",
  not_feasible: "Not feasible",
};

export function InternalPanel({
  submission,
  members,
}: {
  submission: SubmissionDetail;
  members: { id: string; displayName: string }[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionHeading level="eyebrow" className="mb-2">
          Stage
        </SectionHeading>
        <form action={setStageForm} className="flex items-end gap-2">
          <input type="hidden" name="submission_id" value={submission.id} />
          <Select name="stage" defaultValue={submission.stage} className="w-auto">
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABEL[stage]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </form>
      </section>

      <section>
        <SectionHeading level="eyebrow" className="mb-2">
          Owner
        </SectionHeading>
        <form action={assignOwner} className="flex items-end gap-2">
          <input type="hidden" name="submission_id" value={submission.id} />
          <Select name="owner_id" defaultValue={submission.owner_id ?? ""} className="w-auto">
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </form>
      </section>

      <section>
        <SectionHeading level="eyebrow" className="mb-2">
          Assessment
        </SectionHeading>
        <form action={updateAssessment} className="flex flex-col gap-3">
          <input type="hidden" name="submission_id" value={submission.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Overall fit" htmlFor="fit">
              <Select id="fit" name="fit" defaultValue={submission.fit ?? ""}>
                <option value="">—</option>
                {FIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {FIT_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Capacity" htmlFor="capacity">
              <Select id="capacity" name="capacity" defaultValue={submission.capacity ?? ""}>
                <option value="">—</option>
                {CAPACITY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CAPACITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timing" htmlFor="timing">
              <Select id="timing" name="timing" defaultValue={submission.timing ?? ""}>
                <option value="">—</option>
                {TIMING_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {TIMING_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Primary WUWF function involved" htmlFor="primary_function">
            <Input
              id="primary_function"
              name="primary_function"
              defaultValue={submission.primary_function ?? ""}
              placeholder="e.g. News, Music, Production"
            />
          </Field>
          <Field label="Potential staff lead" htmlFor="potential_staff_lead">
            <Input
              id="potential_staff_lead"
              name="potential_staff_lead"
              defaultValue={submission.potential_staff_lead ?? ""}
            />
          </Field>
          <Field label="Key considerations" htmlFor="key_considerations">
            <Textarea
              id="key_considerations"
              name="key_considerations"
              rows={3}
              defaultValue={submission.key_considerations ?? ""}
            />
          </Field>
          <Button type="submit" variant="secondary" className="self-start">
            Save assessment
          </Button>
        </form>
      </section>

      <section>
        <SectionHeading level="eyebrow" className="mb-2">
          Next action
        </SectionHeading>
        <form action={setNextAction} className="flex flex-col gap-3">
          <input type="hidden" name="submission_id" value={submission.id} />
          <Field label="Next action" htmlFor="next_action">
            <Input
              id="next_action"
              name="next_action"
              defaultValue={submission.next_action ?? ""}
            />
          </Field>
          <Field label="Next-action date" htmlFor="next_action_date">
            <Input
              id="next_action_date"
              name="next_action_date"
              type="date"
              defaultValue={submission.next_action_date ?? ""}
            />
          </Field>
          <Button type="submit" variant="secondary" className="self-start">
            Save
          </Button>
        </form>
      </section>

      <section>
        <SectionHeading level="eyebrow" className="mb-2">
          Disposition
        </SectionHeading>
        {submission.disposition ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-700">
              {DISPOSITION_LABEL[submission.disposition]}
              {submission.disposition_reason ? `: ${submission.disposition_reason}` : ""}
            </p>
            <form action={reopenSubmission}>
              <input type="hidden" name="submission_id" value={submission.id} />
              <Button type="submit" variant="secondary">
                Reopen
              </Button>
            </form>
          </div>
        ) : (
          <form action={setDisposition} className="flex flex-col gap-3">
            <input type="hidden" name="submission_id" value={submission.id} />
            <Field label="Set disposition" htmlFor="disposition">
              <Select id="disposition" name="disposition" defaultValue="">
                <option value="" disabled>
                  Choose one
                </option>
                {DISPOSITIONS.map((value) => (
                  <option key={value} value={value}>
                    {DISPOSITION_LABEL[value]}
                    {dispositionRequiresReason(value) ? "" : " (no reason needed)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="reason">
              <Textarea id="reason" name="reason" rows={2} />
            </Field>
            <Button type="submit" variant="secondary" className="self-start">
              Apply
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
