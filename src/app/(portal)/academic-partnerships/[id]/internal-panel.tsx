import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Stage</h2>
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Owner</h2>
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
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Assessment</h2>
        <form action={updateAssessment} className="flex flex-col gap-3">
          <input type="hidden" name="submission_id" value={submission.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="fit">Overall fit</Label>
              <Select id="fit" name="fit" defaultValue={submission.fit ?? ""}>
                <option value="">—</option>
                {FIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {FIT_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Select id="capacity" name="capacity" defaultValue={submission.capacity ?? ""}>
                <option value="">—</option>
                {CAPACITY_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {CAPACITY_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="timing">Timing</Label>
              <Select id="timing" name="timing" defaultValue={submission.timing ?? ""}>
                <option value="">—</option>
                {TIMING_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {TIMING_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="primary_function">Primary WUWF function involved</Label>
            <Input
              id="primary_function"
              name="primary_function"
              defaultValue={submission.primary_function ?? ""}
              placeholder="e.g. News, Music, Production"
            />
          </div>
          <div>
            <Label htmlFor="potential_staff_lead">Potential staff lead</Label>
            <Input
              id="potential_staff_lead"
              name="potential_staff_lead"
              defaultValue={submission.potential_staff_lead ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="key_considerations">Key considerations</Label>
            <Textarea
              id="key_considerations"
              name="key_considerations"
              rows={3}
              defaultValue={submission.key_considerations ?? ""}
            />
          </div>
          <Button type="submit" variant="secondary" className="self-start">
            Save assessment
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">Next action</h2>
        <form action={setNextAction} className="flex flex-col gap-3">
          <input type="hidden" name="submission_id" value={submission.id} />
          <div>
            <Label htmlFor="next_action">Next action</Label>
            <Input id="next_action" name="next_action" defaultValue={submission.next_action ?? ""} />
          </div>
          <div>
            <Label htmlFor="next_action_date">Next-action date</Label>
            <Input
              id="next_action_date"
              name="next_action_date"
              type="date"
              defaultValue={submission.next_action_date ?? ""}
            />
          </div>
          <Button type="submit" variant="secondary" className="self-start">
            Save
          </Button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
          Disposition
        </h2>
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
            <div>
              <Label htmlFor="disposition">Set disposition</Label>
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
            </div>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" name="reason" rows={2} />
            </div>
            <Button type="submit" variant="secondary" className="self-start">
              Apply
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
