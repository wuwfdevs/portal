import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { EVENT_STATUS_BADGE, LISTING_BADGE } from "@/lib/audience-listening/events";
import type { AlCampaign, EventListRow } from "@/lib/audience-listening/campaign-queries";

export function EventsTab({ campaign, events }: { campaign: AlCampaign; events: EventListRow[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <PrimaryLink href={`/audience-listening/events/new?campaign=${campaign.id}`}>New event</PrimaryLink>
      </div>
      {events.length === 0 ? (
        <EmptyState className="leading-relaxed">No events yet. An event is a session in a place at a time, inside this campaign&apos;s dates.</EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[760px]">
            <thead>
              <HeaderRow>
                <Th>Event</Th>
                <Th>When</Th>
                <Th>Status</Th>
                <Th>Listing</Th>
                <Th className="text-right">Tables</Th>
                <Th className="text-right">Seats saved</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {events.map(({ event, tableCount, seatCount }) => (
                <Row key={event.id}>
                  <Cell stack="title">
                    <TextLink href={`/audience-listening/events/${event.id}`} className="px-0 font-semibold">
                      {event.title}
                    </TextLink>
                    <p className="mt-0.5 text-xs text-ink-400">{event.place_name}</p>
                  </Cell>
                  <Cell label="When" className="text-ink-500">
                    {formatEventTime(event.starts_at)}
                  </Cell>
                  <Cell stack="aside">
                    <Badge variant={EVENT_STATUS_BADGE[event.status].variant}>{EVENT_STATUS_BADGE[event.status].label}</Badge>
                  </Cell>
                  <Cell label="Listing">
                    {event.visibility === "public" ? (
                      <Badge variant={LISTING_BADGE[event.listing_state].variant}>{LISTING_BADGE[event.listing_state].label}</Badge>
                    ) : (
                      <span className="text-ink-400">Private</span>
                    )}
                  </Cell>
                  <Cell label="Tables" className="text-right text-ink-500">
                    {tableCount}
                  </Cell>
                  <Cell label="Seats saved" className="text-right text-ink-500">
                    {event.seats != null ? `${seatCount} of ${event.seats}` : "—"}
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
