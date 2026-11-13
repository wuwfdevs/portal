import { requireToolAccess } from "@/lib/auth/authz";
import { listEvents } from "@/lib/audience-listening/campaign-queries";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { EVENT_STATUS_BADGE, LISTING_BADGE } from "@/lib/audience-listening/events";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/primary-link";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ListeningNav } from "../listening-nav";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ show?: string; error?: string }> }) {
  await requireToolAccess("audience-listening");
  const { show, error } = await searchParams;
  const pendingOnly = show === "review";
  const [rows, allRows] = await Promise.all([
    listEvents(pendingOnly ? { listing: "pending_review" } : {}),
    pendingOnly ? listEvents({ listing: "pending_review" }) : Promise.resolve(null),
  ]);
  const pendingCount = (allRows ?? rows).filter((r) => r.event.listing_state === "pending_review").length;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Events"
        description="Listening sessions across every campaign, soonest first. A new event is made from its campaign, so it starts inside the campaign's dates."
      />
      <ListeningNav current="events" />
      {error && <Alert className="mb-4">{error}</Alert>}

      <FilterChips
        label="Show"
        className="mb-4"
        chips={[
          { label: "All events", href: "/audience-listening/events", active: !pendingOnly },
          { label: "Waiting for review", count: pendingCount, href: "/audience-listening/events?show=review", active: pendingOnly },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          {pendingOnly ? "No public event is waiting for review." : "No events yet. Open a campaign and add one from its Events tab."}
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[820px]">
            <thead>
              <HeaderRow>
                <Th>Event</Th>
                <Th>Campaign</Th>
                <Th>When</Th>
                <Th>Status</Th>
                <Th>Listing</Th>
                <Th className="text-right">Tables</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map(({ event, campaignTitle, tableCount }) => (
                <Row key={event.id}>
                  <Cell stack="title">
                    <TextLink href={`/audience-listening/events/${event.id}`} className="px-0 font-semibold">
                      {event.title}
                    </TextLink>
                    <p className="mt-0.5 text-xs text-ink-400">{event.place_name}</p>
                  </Cell>
                  <Cell label="Campaign" className="text-ink-500">
                    <TextLink href={`/audience-listening/campaigns/${event.campaign_id}?tab=events`} className="px-0">
                      {campaignTitle}
                    </TextLink>
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
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
