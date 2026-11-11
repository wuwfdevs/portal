import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { getCampaign, getEvent, listConversations, listTables } from "@/lib/audience-listening/campaign-queries";
import { listPrompts } from "@/lib/audience-listening/campaign-queries";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { TABLE_STATE_LABEL } from "@/lib/audience-listening/events";
import { CONVERSATION_STATUS_LABEL } from "@/lib/audience-listening/conversations";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { formatClockMs } from "@/lib/format";
import { callLastFive, clearHelpRequest, setRoomPrompt } from "../../../conversation-actions";
import { TonightWatch } from "./tonight-watch";

export default async function TonightPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireAudienceListeningContext();
  const { id } = await params;
  const { error } = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const [campaign, tables, conversations, prompts] = await Promise.all([
    getCampaign(event.campaign_id),
    listTables(id),
    listConversations(id),
    listPrompts(event.campaign_id),
  ]);
  const conversationByTable = new Map(conversations.map((c) => [c.table_id, c]));
  const asking = tables.filter((t) => t.help_requested_at);
  const eventHref = `/audience-listening/events/${id}`;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{ href: eventHref, label: `Back to ${event.title}` }}
        title="Tonight"
        description={`${event.title} · ${formatEventTime(event.starts_at)}${campaign ? ` · ${campaign.title}` : ""}`}
      />
      {error && <Alert className="mb-4">{error}</Alert>}
      <div className="mb-6">
        <TonightWatch eventId={id} helpCount={asking.length} />
      </div>
      {asking.length > 0 && (
        <Alert variant="warning" className="mb-6">
          {asking.map((t) => `Table ${t.number}`).join(", ")} asked for a hand.
        </Alert>
      )}
      {event.last_call_at && (
        <Alert variant="note" className="mb-6">
          The last five minutes were called at {formatEventTime(event.last_call_at)}.
        </Alert>
      )}

      <div className="flex max-w-3xl flex-col gap-6">
        <Card className="p-5">
          <SectionHeading className="mb-3">The room</SectionHeading>
          <div className="flex flex-wrap items-end gap-6">
            <form action={setRoomPrompt} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="event_id" value={id} />
              <Field label="Prompt for the room" htmlFor="position">
                <Select id="position" name="position" defaultValue={event.current_prompt_position}>
                  {prompts.map((p) => (
                    <option key={p.id} value={p.position}>
                      {p.position}. {p.text.slice(0, 60)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary" disabled={prompts.length === 0}>
                Move the room
              </Button>
            </form>
            <form action={callLastFive}>
              <input type="hidden" name="event_id" value={id} />
              <Button type="submit" variant="secondary" disabled={Boolean(event.last_call_at)}>
                Call the last five minutes
              </Button>
            </form>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-3">Tables</SectionHeading>
          {tables.length === 0 ? (
            <p className="text-sm text-ink-500">This event has no tables.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {tables.map((table) => {
                const conversation = conversationByTable.get(table.id);
                return (
                  <li key={table.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        <Link className="underline" href={`${eventHref}/tables/${table.id}`}>
                          Table {table.number}
                        </Link>{" "}
                        <Badge variant={table.state === "recording" ? "success" : "muted"}>{TABLE_STATE_LABEL[table.state]}</Badge>{" "}
                        {table.help_requested_at && <Badge variant="warning">Asked for a hand</Badge>}
                      </p>
                      <p className="text-xs text-ink-400">
                        {table.facilitator_first_name ? `${table.facilitator_first_name} · ` : ""}
                        on prompt {table.prompt_position}
                        {conversation ? ` · ${formatClockMs(conversation.duration_ms)} recorded` : ""}
                      </p>
                    </div>
                    {table.help_requested_at && (
                      <form action={clearHelpRequest}>
                        <input type="hidden" name="event_id" value={id} />
                        <input type="hidden" name="table_id" value={table.id} />
                        <Button type="submit" variant="secondary">
                          Someone is on the way
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-1">After</SectionHeading>
          <p className="mb-3 text-sm text-ink-500">Where each table&apos;s recording has got to. Open a table to send it to Sourcework and read what came back.</p>
          {conversations.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing has been recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {tables
                .filter((t) => conversationByTable.has(t.id))
                .map((t) => {
                  const c = conversationByTable.get(t.id)!;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>Table {t.number}</span>
                      <span className="text-ink-500">
                        {CONVERSATION_STATUS_LABEL[c.status]} · {formatClockMs(c.duration_ms)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">
            Nothing reminds anyone to finish. The Portal has no job queue, so check this list the next day for tables still marked as recording or uploading.
          </p>
        </Card>
      </div>
    </div>
  );
}
