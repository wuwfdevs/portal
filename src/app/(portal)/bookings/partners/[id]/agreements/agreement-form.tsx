import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { AGREEMENT_LABEL_MAX } from "@/lib/bookings/agreements";
import type { BkAgreementRow } from "@/lib/bookings/queries";
import { TextLink } from "@/components/ui/primary-link";

/**
 * The one agreement form, shared by `/agreements/new` and `/agreements/[id]/edit`
 * (docs/ui-patterns.md rule 3). The terms the executive approves — dates, the
 * reserve share, funded hours, deadlines, the airtime allowance — sit first;
 * the framework's narrative fields follow. Once approved, the guard trigger
 * lets only the executive change the terms; the form says so.
 */
export function AgreementForm({
  action,
  partnerId,
  agreement,
  submitLabel,
  cancelHref,
  error,
  termsLocked,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partnerId: string;
  agreement?: BkAgreementRow;
  submitLabel: string;
  cancelHref: string;
  error?: string;
  /** The agreement is approved and the viewer is not the executive: the numeric terms are shown read-only. */
  termsLocked: boolean;
}) {
  const num = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);
  return (
    <form action={action} className="flex w-full max-w-3xl flex-col gap-6">
      {error && <Alert>{error}</Alert>}
      <input type="hidden" name="partner_id" value={partnerId} />
      {agreement && <input type="hidden" name="agreement_id" value={agreement.id} />}

      <Card>
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          The terms
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              name="label"
              required
              maxLength={AGREEMENT_LABEL_MAX}
              defaultValue={agreement?.label ?? ""}
              placeholder="OUR Voices, spring 2027"
              autoFocus={!agreement}
            />
          </div>
          {termsLocked && (
            <p className="text-xs text-ink-500 sm:col-span-2">
              This agreement is approved. Its dates, hours, deadlines and airtime allowance change
              only with the Executive Director; the notes below stay editable.
            </p>
          )}
          <div>
            <Label htmlFor="starts_on">First day</Label>
            <Input
              id="starts_on"
              name="starts_on"
              type="date"
              required
              readOnly={termsLocked}
              defaultValue={agreement?.starts_on ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="ends_on">Last day</Label>
            <Input
              id="ends_on"
              name="ends_on"
              type="date"
              required
              readOnly={termsLocked}
              defaultValue={agreement?.ends_on ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="reserve_hours_allocated">Reserve share, in professional hours</Label>
            <Input
              id="reserve_hours_allocated"
              name="reserve_hours_allocated"
              type="number"
              step="0.25"
              min="0"
              readOnly={termsLocked}
              defaultValue={num(agreement?.reserve_hours_allocated)}
            />
            <FieldHint>
              The part of the term&apos;s reserve this partner&apos;s work may draw. Work under the
              agreement is priced strategic up to it and incremental beyond it.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="funded_student_hours">Funded student hours</Label>
            <Input
              id="funded_student_hours"
              name="funded_student_hours"
              type="number"
              step="0.25"
              min="0"
              readOnly={termsLocked}
              defaultValue={num(agreement?.funded_student_hours)}
            />
            <FieldHint>
              Student / OPS hours the partner funds; the agreement page shows them used.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="booking_deadline_days">Booking deadline, days before</Label>
            <Input
              id="booking_deadline_days"
              name="booking_deadline_days"
              type="number"
              step="1"
              min="0"
              readOnly={termsLocked}
              defaultValue={num(agreement?.booking_deadline_days ?? 14)}
            />
            <FieldHint>A reserved block is expected to carry a request by then.</FieldHint>
          </div>
          <div>
            <Label htmlFor="release_deadline_days">Release deadline, days before</Label>
            <Input
              id="release_deadline_days"
              name="release_deadline_days"
              type="number"
              step="1"
              min="0"
              readOnly={termsLocked}
              defaultValue={num(agreement?.release_deadline_days ?? 7)}
            />
            <FieldHint>
              A block nobody has taken by then is open to everyone, unless the director keeps it.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="airtime_minutes_per_week">Airtime allowance, minutes a week</Label>
            <Input
              id="airtime_minutes_per_week"
              name="airtime_minutes_per_week"
              type="number"
              step="1"
              min="0"
              readOnly={termsLocked}
              defaultValue={num(agreement?.airtime_minutes_per_week ?? 0)}
            />
            <FieldHint>
              Contributed airtime the agreement carries, from the term&apos;s envelope.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="expected_volume">Expected volume</Label>
            <Input
              id="expected_volume"
              name="expected_volume"
              maxLength={200}
              defaultValue={agreement?.expected_volume ?? ""}
              placeholder="About 60 episodes a semester"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">
          What the agreement says
        </div>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="direct_cost_treatment">Direct costs</Label>
            <Textarea
              id="direct_cost_treatment"
              name="direct_cost_treatment"
              rows={2}
              defaultValue={agreement?.direct_cost_treatment ?? ""}
              placeholder="Passed through at cost"
            />
          </div>
          <div>
            <Label htmlFor="beyond_envelope_note">Beyond the envelope</Label>
            <Textarea
              id="beyond_envelope_note"
              name="beyond_envelope_note"
              rows={2}
              defaultValue={agreement?.beyond_envelope_note ?? ""}
              placeholder="Work past the reserve share is priced incremental"
            />
          </div>
          <div>
            <Label htmlFor="blackout_notes">Blackouts</Label>
            <Textarea
              id="blackout_notes"
              name="blackout_notes"
              rows={2}
              defaultValue={agreement?.blackout_notes ?? ""}
              placeholder="No sessions during pledge drives"
            />
          </div>
          <div>
            <Label htmlFor="capital_notes">Capital and equipment</Label>
            <Textarea
              id="capital_notes"
              name="capital_notes"
              rows={2}
              defaultValue={agreement?.capital_notes ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={agreement?.notes ?? ""} />
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit">{submitLabel}</Button>
        <TextLink href={cancelHref}>Cancel</TextLink>
      </div>
    </form>
  );
}
