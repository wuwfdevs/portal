import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { getCampaign, getEvent, listConsentTexts, listConversations, listSeats, listTables } from "@/lib/audience-listening/campaign-queries";
import { formatEventTime, readSiteOrigin } from "@/lib/audience-listening/event-times";
import {
  EVENT_ACTION_LABEL,
  EVENT_STATUS_BADGE,
  LISTING_ACTION_LABEL,
  LISTING_BADGE,
  LISTING_CHECKLIST,
  ORGANIZER_KIND_LABEL,
  TABLE_STATE_LABEL,
  VISIBILITY_LABEL,
  availableEventActions,
  availableListingActions,
  eventIsDeletable,
  seatsLeft,
  tableIsRemovable,
} from "@/lib/audience-listening/events";
import { Alert } from "@/components/ui/alert";
import { formatClockMs } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/input";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { DescriptionList } from "@/components/ui/description-list";
import { FormActions } from "@/components/ui/form-actions";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { addTables, deleteEvent, removeSeat, removeTable, setEventStatus, setListing, updateEvent } from "../../event-actions";
import { EventFields } from "../event-fields";
import { TableCards } from "./table-cards";
import { OrganizerLink } from "./organizer-link";
import { emailPendingFacilitatorLinks } from "../../conversation-actions";
import { needsAfterLink } from "@/lib/audience-listening/after-link";

const CONVERSATION_STATUS_LABEL = {
  recording: "Recording",
  uploading: "Uploading",
  complete: "Recording complete",
  transcribing: "Transcribing",
  ready: "Transcript ready",
  named: "Speakers named",
  sent: "Sent",
} as const;

const NOTICES: Record<string, string> = {
  back_in_review:
    "You changed something the public sees on a listed event, so it went back to review. A coordinator has to approve it again before it shows on the website.",
};

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; error?: string; notice?: string; links_sent?: string; links_failed?: string }>;
}) {
  const { isCoordinator } = await requireAudienceListeningContext();
  const { id } = await params;
  const { edit, error, notice, links_sent: linksSent, links_failed: linksFailed } = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();

  const [campaign, tables, seats, conversations, consentTexts] = await Promise.all([
    getCampaign(event.campaign_id),
    listTables(id),
    listSeats(id),
    listConversations(id),
    listConsentTexts(),
  ]);
  const conversationByTable = new Map(conversations.map((c) => [c.table_id, c]));
  const pendingLinks = tables.filter((t) => needsAfterLink(t, conversationByTable.get(t.id) ?? null)).length;
  const editing = edit === "1";
  const eventBadge = EVENT_STATUS_BADGE[event.status];
  const listingBadge = LISTING_BADGE[event.listing_state];
  const listingActions = availableListingActions(event.listing_state, event.visibility, isCoordinator);
  const left = seatsLeft(event.seats, seats.length);
  const backHref = `/audience-listening/campaigns/${event.campaign_id}?tab=events`;
  const linksReady = readSiteOrigin(process.env.WEBSITE_ORIGIN);
  const canIssue = linksReady.ok && event.status !== "cancelled" && event.status !== "done";

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{ href: backHref, label: campaign ? `Back to ${campaign.title}` : "Back to the campaign" }}
        title={event.title}
        badge={<Badge variant={eventBadge.variant}>{eventBadge.label}</Badge>}
        description={`${formatEventTime(event.starts_at)} · ${event.place_name}`}
        actions={
          <>
            {!editing && <SecondaryLink href={`/audience-listening/events/${event.id}/tonight`}>Tonight</SecondaryLink>}
            {!editing && <SecondaryLink href={`/audience-listening/events/${event.id}?edit=1`}>Edit</SecondaryLink>}
            {availableEventActions(event.status).map((action) => (
              <form key={action} action={setEventStatus}>
                <input type="hidden" name="event_id" value={event.id} />
                <input type="hidden" name="action" value={action} />
                <Button type="submit" variant={action === "schedule" ? "primary" : "secondary"}>
                  {EVENT_ACTION_LABEL[action]}
                </Button>
              </form>
            ))}
          </>
        }
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {notice && NOTICES[notice] && (
        <Alert variant="note" className="mb-4">
          {NOTICES[notice]}
        </Alert>
      )}
      {linksSent !== undefined && (
        <Alert variant={Number(linksFailed) > 0 ? "warning" : "success"} className="mb-4">
          {Number(linksSent)} {Number(linksSent) === 1 ? "link was" : "links were"} emailed to facilitators.
          {Number(linksFailed) > 0 && ` ${Number(linksFailed)} could not be sent; open those tables to see why and to hand over the link yourself.`}
        </Alert>
      )}

      <div className="flex max-w-3xl flex-col gap-6">
        {editing ? (
          <form action={updateEvent} className="flex flex-col gap-4">
            <input type="hidden" name="event_id" value={event.id} />
            <EventFields event={event} showNotes />
            <FormActions cancelHref={`/audience-listening/events/${event.id}`}>
              <Button type="submit">Save</Button>
            </FormActions>
          </form>
        ) : (
          <Card className="p-5">
            <DescriptionList
              items={[
                { label: "When", value: `${formatEventTime(event.starts_at)} to ${formatEventTime(event.ends_at)}` },
                { label: "Place", value: [event.place_name, event.address, event.city].filter(Boolean).join(", ") },
                { label: "Who can find it", value: VISIBILITY_LABEL[event.visibility] },
                { label: "Seats", value: event.seats != null ? `${event.seats} (${left} left)` : null },
                {
                  label: "Organized by",
                  value: [ORGANIZER_KIND_LABEL[event.organizer_kind], event.organizer_label].filter(Boolean).join(": "),
                },
                { label: "A journalist from the station", value: event.wuwf_journalist_joining ? "Joining" : "Not joining" },
                { label: "Private notes", value: event.internal_notes, preserveLines: true },
              ]}
            />
          </Card>
        )}

        {event.visibility === "public" && (
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <SectionHeading>Listing on the website</SectionHeading>
              <Badge variant={listingBadge.variant}>{listingBadge.label}</Badge>
            </div>
            {event.listing_state === "declined" && event.listing_declined_reason && (
              <Alert variant="note" className="mb-3">
                Declined. The organizer is told: {event.listing_declined_reason}
              </Alert>
            )}
            <p className="mb-4 text-sm text-ink-500">
              A public event appears on the website only after a coordinator approves it. Anyone can ask for a review; changing what the public
              sees on a listed event sends it back to review.
            </p>
            {listingActions.length === 0 && event.listing_state === "pending_review" && !isCoordinator && (
              <p className="text-sm text-ink-500">Waiting for a coordinator.</p>
            )}
            <div className="flex flex-col gap-4">
              {listingActions.includes("request_review") && (
                <form action={setListing}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="action" value="request_review" />
                  <Button type="submit">{LISTING_ACTION_LABEL.request_review}</Button>
                </form>
              )}
              {listingActions.includes("approve") && (
                <form action={setListing} className="flex flex-col gap-2.5 border-t border-line pt-4">
                  <input type="hidden" name="event_id" value={event.id} />
                  <p className="text-sm font-semibold text-ink-900">Before you approve, check each of these</p>
                  {LISTING_CHECKLIST.map((item) => (
                    <CheckboxField key={item.key} name="check" value={item.key} label={item.label} />
                  ))}
                  <FormActions>
                    <Button type="submit" name="action" value="approve">
                      {LISTING_ACTION_LABEL.approve}
                    </Button>
                  </FormActions>
                </form>
              )}
              {listingActions.includes("decline") && (
                <form action={setListing} className="flex flex-col gap-2.5 border-t border-line pt-4">
                  <input type="hidden" name="event_id" value={event.id} />
                  <Field label="Reason for declining" htmlFor="reason" hint="The organizer is told this, so write it as you would say it to them.">
                    <Textarea id="reason" name="reason" rows={3} maxLength={1000} />
                  </Field>
                  <FormActions>
                    <Button type="submit" name="action" value="decline" variant="secondary">
                      {LISTING_ACTION_LABEL.decline}
                    </Button>
                  </FormActions>
                </form>
              )}
              {listingActions.includes("withdraw") && (
                <form action={setListing}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="action" value="withdraw" />
                  <Button type="submit" variant="secondary">
                    {LISTING_ACTION_LABEL.withdraw}
                  </Button>
                </form>
              )}
              {listingActions.includes("unlist") && (
                <form action={setListing}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="action" value="unlist" />
                  <ConfirmSubmit
                    trigger="button"
                    label={LISTING_ACTION_LABEL.unlist}
                    confirmLabel="Yes, take it off"
                    message="The event stops showing on the website at once. Seats already saved are kept."
                  />
                </form>
              )}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <SectionHeading className="mb-1">Tables</SectionHeading>
          <p className="mb-4 text-sm text-ink-500">
            A table is one conversation, with a single-use link on its card. A kitchen table is an event with one table. Making links again replaces
            the old ones.
          </p>
          {consentTexts.length === 0 && (
            <Alert variant="note" className="mb-4">
              There is no group consent wording yet, so a table&apos;s link would open to nothing to read aloud.{" "}
              <Link className="underline" href="/audience-listening/consent">
                A coordinator adds it here.
              </Link>
            </Alert>
          )}
          {!linksReady.ok && (
            <Alert variant="note" className="mb-4">
              Links cannot be made yet: {linksReady.problem}
            </Alert>
          )}
          {tables.length === 0 ? (
            <p className="mb-4 text-sm text-ink-500">No tables yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col divide-y divide-line">
              {tables.map((table) => (
                <li key={table.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span className="text-sm text-ink-900">
                    <Link className="underline" href={`/audience-listening/events/${event.id}/tables/${table.id}`}>
                      Table {table.number}
                    </Link>{" "}
                    <Badge variant="muted">{TABLE_STATE_LABEL[table.state]}</Badge>
                    {table.agreed_at && (
                      <span className="ml-2 text-xs text-ink-400">
                        agreed {formatEventTime(table.agreed_at)}
                        {table.consent_text_version ? `, wording version ${table.consent_text_version}` : ""}
                        {table.facilitator_first_name ? `, facilitated by ${table.facilitator_first_name}` : ""}
                      </span>
                    )}
                    {conversationByTable.get(table.id) && (
                      <span className="ml-2 text-xs text-ink-400">
                        {CONVERSATION_STATUS_LABEL[conversationByTable.get(table.id)!.status]},{" "}
                        {formatClockMs(conversationByTable.get(table.id)!.duration_ms)} recorded
                      </span>
                    )}
                    {table.help_requested_at && <Badge variant="warning">Asked for a hand</Badge>}
                  </span>
                  {tableIsRemovable(table.state) && (
                    <form action={removeTable}>
                      <input type="hidden" name="event_id" value={event.id} />
                      <input type="hidden" name="table_id" value={table.id} />
                      <ConfirmSubmit label="Remove" confirmLabel="Yes, remove it" message={`This removes table ${table.number} and its link.`} />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={addTables} className="mb-5 flex flex-wrap items-end gap-3">
            <input type="hidden" name="event_id" value={event.id} />
            <Field label="Add tables" htmlFor="count">
              <Input id="count" name="count" type="number" inputMode="numeric" min={1} max={99} defaultValue={1} className="w-24" />
            </Field>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
          <TableCards
            eventId={event.id}
            eventTitle={event.title}
            canIssue={canIssue}
            tables={tables.map((t) => ({ id: t.id, number: t.number, hasLink: t.join_token_hash != null, used: t.join_token_used_at != null }))}
          />
          {pendingLinks > 0 && (
            <form action={emailPendingFacilitatorLinks} className="mt-5 flex flex-col gap-2 border-t border-line pt-4 print:hidden">
              <input type="hidden" name="event_id" value={event.id} />
              <div>
                <Button type="submit" variant="secondary">
                  Email {pendingLinks === 1 ? "the facilitator" : `${pendingLinks} facilitators`} their link
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                For each table with a facilitator email, a recording not yet sent to the station and no link sent. Press it once the transcripts are ready;
                nothing sends on its own.
              </p>
            </form>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading className="mb-1">The organizer&apos;s room</SectionHeading>
          <OrganizerLink eventId={event.id} hasOrganizer={event.organizer_subject != null} canIssue={isCoordinator && (event.status === "scheduled" || event.status === "live")} />
        </Card>

        {event.visibility === "public" && (
          <Card className="p-5">
            <SectionHeading className="mb-1">Seats</SectionHeading>
            <p className="mb-4 text-sm text-ink-500">
              {event.seats != null ? `${seats.length} of ${event.seats} saved.` : `${seats.length} saved.`} Each person gave a name and an email for this
              event only.
            </p>
            {seats.length === 0 ? (
              <p className="text-sm text-ink-500">No one has saved a seat.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {seats.map((seat) => (
                  <li key={seat.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="text-sm text-ink-900">
                      {seat.name}{" "}
                      <a className="break-all text-brand-hover underline" href={`mailto:${seat.email}`}>
                        {seat.email}
                      </a>
                    </span>
                    <form action={removeSeat}>
                      <input type="hidden" name="event_id" value={event.id} />
                      <input type="hidden" name="seat_id" value={seat.id} />
                      <ConfirmSubmit label="Remove" confirmLabel="Yes, remove" message="This frees the seat and deletes the name and email." />
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {eventIsDeletable(event.status) && (
          <Card className="p-5">
            <SectionHeading className="mb-2">Delete</SectionHeading>
            <form action={deleteEvent}>
              <input type="hidden" name="event_id" value={event.id} />
              <ConfirmSubmit
                label="Delete this event"
                confirmLabel="Yes, delete it"
                message="This removes the event, its tables and its saved seats for good."
              />
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
