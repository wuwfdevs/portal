import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import {
  commitmentMinutesPerWeek,
  formatMinutes,
  type EnvelopeCheck,
  type HonoredCommitment,
} from "@/lib/bookings/airtime";
import { requestHref } from "@/lib/bookings/paths";
import { AIRTIME_TREATMENT_LABEL, HONORED_IN_LABEL } from "@/lib/bookings/projects";
import type { BkAirtimeCommitmentRow, ProjectDetail } from "@/lib/bookings/queries";
import { formatDateShort } from "@/lib/log/program-status";
import { addCommitment, removeCommitment, updateCommitment } from "../actions";

/**
 * The project's airtime commitments (docs/bookings-design.md §2.5): airings
 * a week × length over a date range, contributed or paid, with where each is
 * honored. Checked against the envelope; placed in Traffic or On Air, never
 * here.
 */
export function AirtimeSection({
  detail,
  envelope,
  honored,
  honoredError,
  canEdit,
  openCard,
  editing,
}: {
  detail: ProjectDetail;
  /** The term's envelope check, with this project's commitments included; null without an active plan. */
  envelope: EnvelopeCheck | null;
  honored: HonoredCommitment[];
  honoredError: string | null;
  canEdit: boolean;
  openCard: boolean;
  /** `?airtime=<id>` */
  editing: string | null;
}) {
  const { project, commitments } = detail;
  const here = requestHref(project.id);
  const thisProject = commitments
    .filter((c) => c.treatment === "contributed")
    .reduce((total, c) => total + commitmentMinutesPerWeek(c), 0);
  const canAdd = canEdit && project.disposition === null && project.stage !== "settled";

  return (
    <section className="flex flex-col gap-3 rounded border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-bold text-ink-900">Airtime</h3>
        <span className="text-xs text-ink-500">
          A commitment is honored in Traffic (a message) or On Air (a recurring feature) — recorded
          here, placed there.
        </span>
      </div>

      {envelope && commitments.length > 0 && (
        <p
          className={`text-sm ${envelope.exceeded ? "font-semibold text-[#8F3A3A]" : "text-ink-700"}`}
        >
          This request asks for {formatMinutes(thisProject)} a week of contributed airtime; the
          term&apos;s envelope is {formatMinutes(envelope.contributedMinutesPerWeek)} a week with{" "}
          {formatMinutes(envelope.committedMinutesPerWeek)} committed across requests
          {envelope.exceeded
            ? ` — over by ${formatMinutes(-envelope.remainingMinutesPerWeek)}. The executive decides before approving.`
            : `, ${formatMinutes(envelope.remainingMinutesPerWeek)} left.`}
        </p>
      )}
      {honoredError && <Alert>Could not read Traffic and On Air: {honoredError}</Alert>}

      {commitments.length === 0 ? (
        <p className="rounded border border-dashed border-line px-4 py-3 text-sm text-ink-500">
          No airtime asked for.
        </p>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Commitment</Th>
                <Th>Dates</Th>
                <Th>Treatment</Th>
                <Th>Honored in</Th>
                {canEdit && (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                )}
              </HeaderRow>
            </thead>
            <tbody>
              {commitments.map((commitment) =>
                editing === commitment.id && canEdit ? (
                  <Row key={commitment.id}>
                    <Cell colSpan={canEdit ? 5 : 4} stack="full">
                      <CommitmentFields
                        project={project.id}
                        commitment={commitment}
                        cancelHref={here}
                      />
                    </Cell>
                  </Row>
                ) : (
                  <Row key={commitment.id}>
                    <Cell stack="title">
                      {commitment.airings_per_week} × {commitment.seconds}s a week
                      <span className="block text-xs text-ink-500">
                        {formatMinutes(commitmentMinutesPerWeek(commitment))} a week
                        {commitment.notes ? ` · ${commitment.notes}` : ""}
                      </span>
                    </Cell>
                    <Cell label="Dates">
                      {formatDateShort(commitment.starts_on)}
                      {commitment.ends_on ? ` – ${formatDateShort(commitment.ends_on)}` : " onward"}
                    </Cell>
                    <Cell label="Treatment">
                      <Badge
                        variant={commitment.treatment === "contributed" ? "accent" : "neutral"}
                      >
                        {commitment.treatment}
                      </Badge>
                    </Cell>
                    <Cell label="Honored in">
                      <HonoredCell
                        commitment={commitment}
                        read={honored.find((h) => h.commitment_id === commitment.id)}
                      />
                    </Cell>
                    {canEdit && (
                      <Cell stack="full" className="text-right">
                        <span className="inline-flex items-center gap-2">
                          <Link
                            href={requestHref(project.id, { airtime: commitment.id })}
                            className="text-sm font-bold text-brand-link hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={removeCommitment} className="inline">
                            <input type="hidden" name="project_id" value={project.id} />
                            <input type="hidden" name="commitment_id" value={commitment.id} />
                            <Button type="submit" variant="ghost">
                              Remove
                            </Button>
                          </form>
                        </span>
                      </Cell>
                    )}
                  </Row>
                ),
              )}
            </tbody>
          </Table>
        </TableFrame>
      )}

      {canAdd &&
        (openCard ? (
          <InlineCreateCard
            title="Airtime commitment"
            action={addCommitment}
            submitLabel="Add the commitment"
            cancelHref={here}
          >
            <input type="hidden" name="project_id" value={project.id} />
            <CommitmentInputs project={project} />
          </InlineCreateCard>
        ) : (
          <div>
            <Link
              href={requestHref(project.id, { new: "airtime" })}
              className="text-sm font-bold text-brand-link hover:underline"
            >
              + Airtime commitment
            </Link>
          </div>
        ))}
    </section>
  );
}

function HonoredCell({
  commitment,
  read,
}: {
  commitment: BkAirtimeCommitmentRow;
  read: HonoredCommitment | undefined;
}) {
  if (commitment.honored_in === "pending")
    return <span className="text-ink-500">{HONORED_IN_LABEL.pending}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span>{HONORED_IN_LABEL[commitment.honored_in]}</span>
      {read && read.found ? (
        read.honored_in === "traffic" ? (
          <span className="text-xs text-ink-500">
            {read.label} · contract {read.status} · {read.placements_in_term} placement
            {read.placements_in_term === 1 ? "" : "s"} this term
          </span>
        ) : (
          <span className="text-xs text-ink-500">
            {read.label} · pin {read.status} · {read.airings_per_week} a week × {read.seconds}s
          </span>
        )
      ) : (
        <span className="text-xs text-warning-fg">Not found there — check the id.</span>
      )}
    </span>
  );
}

function CommitmentFields({
  project,
  commitment,
  cancelHref,
}: {
  project: string;
  commitment: BkAirtimeCommitmentRow;
  cancelHref: string;
}) {
  return (
    <form action={updateCommitment} className="flex flex-col gap-3">
      <input type="hidden" name="project_id" value={project} />
      <input type="hidden" name="commitment_id" value={commitment.id} />
      <CommitmentInputs
        project={{ id: project, event_starts_on: null, event_ends_on: null }}
        commitment={commitment}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary">
          Save
        </Button>
        <Link href={cancelHref} className="text-sm font-bold text-brand-link hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function CommitmentInputs({
  project,
  commitment,
}: {
  project: { id: string; event_starts_on: string | null; event_ends_on: string | null };
  commitment?: BkAirtimeCommitmentRow;
}) {
  const p = commitment?.id ?? "new";
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <Label htmlFor={`a_airings_${p}`}>Airings a week</Label>
        <Input
          id={`a_airings_${p}`}
          name="airings_per_week"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={commitment?.airings_per_week ?? 5}
        />
      </div>
      <div>
        <Label htmlFor={`a_seconds_${p}`}>Length (seconds)</Label>
        <Input
          id={`a_seconds_${p}`}
          name="seconds"
          type="number"
          min="1"
          step="1"
          required
          defaultValue={commitment?.seconds ?? 30}
        />
      </div>
      <div>
        <Label htmlFor={`a_starts_${p}`}>First air date</Label>
        <Input
          id={`a_starts_${p}`}
          name="starts_on"
          type="date"
          required
          defaultValue={commitment?.starts_on ?? project.event_starts_on ?? ""}
        />
      </div>
      <div>
        <Label htmlFor={`a_ends_${p}`}>Last air date</Label>
        <Input
          id={`a_ends_${p}`}
          name="ends_on"
          type="date"
          defaultValue={commitment?.ends_on ?? project.event_ends_on ?? ""}
        />
        <FieldHint>Blank for an open-ended feature.</FieldHint>
      </div>
      <div>
        <Label htmlFor={`a_treatment_${p}`}>Treatment</Label>
        <Select
          id={`a_treatment_${p}`}
          name="treatment"
          defaultValue={commitment?.treatment ?? "contributed"}
        >
          <option value="contributed">{AIRTIME_TREATMENT_LABEL.contributed}</option>
          <option value="paid">{AIRTIME_TREATMENT_LABEL.paid}</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={`a_honored_${p}`}>Honored in</Label>
        <Select
          id={`a_honored_${p}`}
          name="honored_in"
          defaultValue={commitment?.honored_in ?? "pending"}
        >
          <option value="pending">{HONORED_IN_LABEL.pending}</option>
          <option value="traffic">{HONORED_IN_LABEL.traffic} — a contract</option>
          <option value="on_air">{HONORED_IN_LABEL.on_air} — a pin on the clock</option>
        </Select>
      </div>
      <div className="col-span-2">
        <Label htmlFor={`a_ref_${p}`}>Traffic contract or On Air pin id</Label>
        <Input
          id={`a_ref_${p}`}
          name="external_ref"
          defaultValue={commitment?.external_ref ?? ""}
          placeholder="Paste the id once it is placed there"
        />
        <FieldHint>
          Required once honored somewhere; the dashboard reads what was actually scheduled from it.
        </FieldHint>
      </div>
      <div className="col-span-2 sm:col-span-4">
        <Label htmlFor={`a_notes_${p}`}>Notes</Label>
        <Textarea
          id={`a_notes_${p}`}
          name="notes"
          rows={2}
          maxLength={500}
          defaultValue={commitment?.notes ?? ""}
        />
      </div>
    </div>
  );
}
