import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { OUTCOME_KINDS, OUTCOME_KIND_LABEL, MAX_OUTCOME_SUMMARY_LENGTH, MAX_OUTCOME_TITLE_LENGTH } from "@/lib/audience-listening/outcomes";
import type { AlOutcome, AlQuery } from "@/lib/audience-listening/queries";
import { stationTodayISO } from "@/lib/station-time";
import { addOutcome, removeOutcome } from "../actions";

/** A calendar date (YYYY-MM-DD) as "Nov 1, 2026", with no timezone shift. */
function formatCalendarDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * What came of this query: a story, an episode or a report, each a title and a link staff paste. The website's
 * listening page shows them under "You asked. Here's what came of it." once the query is listed there. The
 * Portal knows no CMS, so nothing here is fetched or checked against one.
 */
export function OutcomesTab({ query, outcomes }: { query: AlQuery; outcomes: AlOutcome[] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {query.listed_on_hub ? (
        <Alert variant="info">
          This query is listed on the website&apos;s listening page, so these show there
          {outcomes.length > 0 ? ", with the number of people who answered." : " once you add one."}
        </Alert>
      ) : (
        <Alert variant="note">
          This query is not listed on the website&apos;s listening page, so nothing here is shown
          there. Turn on &ldquo;List on the website&apos;s listening page&rdquo; in Settings.
        </Alert>
      )}

      {outcomes.length === 0 ? (
        <EmptyState compact className="max-w-md">
          Nothing yet. When a story, an episode or a report comes from the answers, add it here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {outcomes.map((outcome) => (
            <li key={outcome.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">{OUTCOME_KIND_LABEL[outcome.kind]}</Badge>
                  <span className="text-meta text-ink-400">{formatCalendarDate(outcome.published_at)}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink-900">{outcome.title}</p>
                <a
                  href={outcome.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block break-all text-meta text-brand-hover underline"
                >
                  {outcome.url}
                </a>
                {outcome.summary && <p className="mt-2 text-sm leading-relaxed text-ink-500">{outcome.summary}</p>}
                <form action={removeOutcome} className="mt-3 border-t border-line pt-3">
                  <input type="hidden" name="query_id" value={query.id} />
                  <input type="hidden" name="outcome_id" value={outcome.id} />
                  <ConfirmSubmit
                    label="Remove"
                    confirmLabel="Yes, remove it"
                    message="This takes it off the website's listening page. The story itself is not touched."
                  />
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-5">
        <SectionHeading className="mb-1">Add an outcome</SectionHeading>
        <p className="mb-4 text-meta leading-relaxed text-ink-400">
          A title and the link readers are sent to. The summary is optional and public.
        </p>
        <form action={addOutcome} className="flex flex-col gap-4">
          <input type="hidden" name="query_id" value={query.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What is it" htmlFor="outcome_kind">
              <Select id="outcome_kind" name="kind" defaultValue="story">
                {OUTCOME_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {OUTCOME_KIND_LABEL[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Published" htmlFor="outcome_published_at">
              <Input id="outcome_published_at" name="published_at" type="date" defaultValue={stationTodayISO()} required />
            </Field>
          </div>
          <Field label="Title" htmlFor="outcome_title">
            <Input id="outcome_title" name="title" maxLength={MAX_OUTCOME_TITLE_LENGTH} required />
          </Field>
          <Field label="Link" htmlFor="outcome_url" hint="A full https:// address.">
            <Input id="outcome_url" name="url" type="url" inputMode="url" placeholder="https://" required />
          </Field>
          <Field label="Summary" htmlFor="outcome_summary" hint="Optional. One or two sentences.">
            <Textarea id="outcome_summary" name="summary" rows={3} maxLength={MAX_OUTCOME_SUMMARY_LENGTH} />
          </Field>
          <FormActions>
            <Button type="submit">Add outcome</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  );
}
