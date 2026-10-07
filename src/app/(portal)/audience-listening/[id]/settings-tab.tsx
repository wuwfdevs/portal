import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { participantFields } from "@/lib/audience-listening/participation";
import type { AlQuery } from "@/lib/audience-listening/queries";
import type { AlFieldMode } from "@/lib/database.types";
import { deleteQuery, updateQuerySettings } from "../actions";

/** `datetime-local` needs "YYYY-MM-DDTHH:mm" in local time; Postgres gives ISO/UTC. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Every field a query can ask for, in the fixed order the public form uses.
// participantFields() with every mode set to "optional" is the canonical list —
// asking it here rather than re-typing the labels keeps this screen and the
// public form describing the same things in the same words.
const ALL_FIELDS = participantFields({
  name: "optional",
  city: "optional",
  email: "optional",
  phone: "optional",
  note: "optional",
});

export function SettingsTab({
  query,
  hasSubmissions,
}: {
  query: AlQuery;
  hasSubmissions: boolean;
}) {
  const fieldModes: Record<string, AlFieldMode> = {
    name: query.field_name,
    city: query.field_city,
    email: query.field_email,
    phone: query.field_phone,
    note: query.field_note,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form action={updateQuerySettings} className="flex flex-col gap-6">
        <input type="hidden" name="query_id" value={query.id} />

        <Card className="p-5">
          <SectionHeading className="mb-4">What people read</SectionHeading>
          <div className="flex flex-col gap-4">
            <Field label="Internal title" htmlFor="internal_title">
              <Input
                id="internal_title"
                name="internal_title"
                defaultValue={query.internal_title}
                required
              />
            </Field>
            <Field label="Public title" htmlFor="public_title">
              <Input
                id="public_title"
                name="public_title"
                defaultValue={query.public_title}
                required
              />
            </Field>
            <Field label="Public introduction" htmlFor="public_intro">
              <Textarea
                id="public_intro"
                name="public_intro"
                rows={5}
                defaultValue={query.public_intro}
              />
            </Field>
            <Field label="Internal notes" htmlFor="internal_notes">
              <Textarea
                id="internal_notes"
                name="internal_notes"
                rows={3}
                defaultValue={query.internal_notes ?? ""}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-1">Participant information</SectionHeading>
          <p className="mb-4 text-xs leading-relaxed text-ink-400">
            Asked once, for the whole submission — never per question. Hidden fields are not shown
            at all.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {ALL_FIELDS.map((spec) => (
              <Field
                key={spec.key}
                label={spec.label.replace(/\?$/, "")}
                htmlFor={`field_${spec.key}`}
              >
                <Select
                  id={`field_${spec.key}`}
                  name={`field_${spec.key}`}
                  defaultValue={fieldModes[spec.key]}
                >
                  <option value="hidden">Don&apos;t ask</option>
                  <option value="optional">Optional</option>
                  <option value="required">Required</option>
                </Select>
              </Field>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-1">Consent and attribution</SectionHeading>
          <p className="mb-4 text-xs leading-relaxed text-ink-400">
            These are three separate questions and stay separate on the record: permission to be
            contacted is not permission to be named, and asking to be considered anonymously is
            neither.
          </p>
          <div className="mb-4 flex flex-col gap-2.5">
            <CheckboxField
              name="ask_contact_permission"
              defaultChecked={query.ask_contact_permission}
              label="Ask whether WUWF may contact them about their responses"
            />
            <CheckboxField
              name="ask_attribution_permission"
              defaultChecked={query.ask_attribution_permission}
              label="Ask whether WUWF may identify them by name"
            />
            <CheckboxField
              name="allow_anonymous_request"
              defaultChecked={query.allow_anonymous_request}
              label="Offer the option to ask that responses be considered anonymously"
            />
          </div>
          <Field
            label="Consent terms"
            htmlFor="consent_text"
            hint="Shown in full above the required agreement box, and recorded with the submission at the moment it's accepted. Don't promise anonymity a recording can't deliver — a voice and a story identify a person whatever the checkbox says."
          >
            <Textarea
              id="consent_text"
              name="consent_text"
              rows={7}
              defaultValue={query.consent_text}
              required
            />
          </Field>
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-4">Publication and transcription</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Opens"
              htmlFor="opens_at"
              hint="Optional. Blank means as soon as you open it."
            >
              <Input
                id="opens_at"
                name="opens_at"
                type="datetime-local"
                defaultValue={toLocalInputValue(query.opens_at)}
              />
            </Field>
            <Field
              label="Closes"
              htmlFor="closes_at"
              hint="Optional. Someone already recording may still finish and submit."
            >
              <Input
                id="closes_at"
                name="closes_at"
                type="datetime-local"
                defaultValue={toLocalInputValue(query.closes_at)}
              />
            </Field>
          </div>
          <Field
            label="Transcription"
            htmlFor="transcription_mode"
            className="mt-4 max-w-sm"
            hint="Automatic queues each answer the moment a submission arrives; the Submissions tab then sends the whole queue in one click. There's no background job runner in this portal, so nothing transcribes entirely unattended."
          >
            <Select
              id="transcription_mode"
              name="transcription_mode"
              defaultValue={query.transcription_mode}
            >
              <option value="manual">Manual — send answers after reviewing them</option>
              <option value="automatic">Automatic — queue every answer on submission</option>
            </Select>
          </Field>
        </Card>

        <div>
          <Button type="submit">Save settings</Button>
        </div>
      </form>

      <Card className="border-danger/30 p-5">
        <SectionHeading className="mb-1">Delete this query</SectionHeading>
        {hasSubmissions ? (
          <Alert variant="note" className="mt-3">
            This query has submissions and can&apos;t be deleted. Archive it instead — archiving
            keeps every response, every answer, and every transcription link.
          </Alert>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-ink-500">
              Only possible while a query has never been answered. Once a submission exists,
              archiving is the way to finish with a query.
            </p>
            <form action={deleteQuery}>
              <input type="hidden" name="query_id" value={query.id} />
              <Button type="submit" variant="danger">
                Delete query
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
