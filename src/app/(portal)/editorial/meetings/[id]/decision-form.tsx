"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import type { Member, MeetingPitchRow } from "@/lib/editorial/data";
import type { EpDecisionOutcome } from "@/lib/database.types";
import { recordDecision } from "../actions";

const CONSEQUENCE: Record<EpDecisionOutcome, string> = {
  assigned: "A reporter takes it, and it leaves the backlog.",
  deferred: "It stays in the backlog for a later meeting.",
  archived: "Parked and kept on the record. An editor can restore it.",
};

/**
 * One slate item's decision: a Decision select and a Record button, with the
 * fields the chosen outcome needs appearing under it — a reporter for Assign,
 * a reason for Archive, nothing for Defer. One line for the common case, and
 * native on a phone. The select is the form's `outcome` field, so the Server
 * Action reads it exactly as it read the three buttons this replaced.
 */
export function DecisionForm({
  meetingId,
  entry,
  pitchTitle,
  members,
}: {
  meetingId: string;
  entry: MeetingPitchRow;
  pitchTitle: string;
  members: Member[];
}) {
  const [outcome, setOutcome] = useState<EpDecisionOutcome | "">(entry.outcome ?? "");
  const idBase = `decision-${entry.id}`;

  return (
    <form action={recordDecision} className="flex flex-col gap-3 px-4 py-3.5">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="entry_id" value={entry.id} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Decision" htmlFor={`${idBase}-outcome`} className="w-full sm:w-44">
          <Select
            id={`${idBase}-outcome`}
            name="outcome"
            required
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as EpDecisionOutcome | "")}
          >
            <option value="">Choose…</option>
            <option value="assigned">Assign</option>
            <option value="deferred">Defer</option>
            <option value="archived">Archive</option>
          </Select>
        </Field>
        {outcome === "assigned" && (
          <Field label="Assign to" htmlFor={`${idBase}-assignee`} className="w-full sm:w-52">
            <Select
              id={`${idBase}-assignee`}
              name="assigned_to"
              required
              defaultValue={entry.assigned_to ?? ""}
            >
              <option value="">Choose a reporter…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {outcome !== "" && (
          <Field
            label={outcome === "archived" ? "Reason" : "Rationale"}
            htmlFor={`${idBase}-rationale`}
            className="min-w-0 flex-1 basis-56"
          >
            <Input
              id={`${idBase}-rationale`}
              name="rationale"
              defaultValue={entry.rationale ?? ""}
              placeholder={
                outcome === "archived" ? "Why it is being parked (optional)" : "Optional"
              }
              aria-label={`Rationale for ${pitchTitle}`}
              maxLength={300}
            />
          </Field>
        )}
        <Button type="submit" disabled={outcome === ""}>
          Record
        </Button>
      </div>
      <p className="text-label text-ink-400">
        {outcome === ""
          ? "Pick a decision; the fields it needs appear here."
          : CONSEQUENCE[outcome]}
        {entry.outcome !== null && " Saving again replaces the recorded decision."}
      </p>
    </form>
  );
}
