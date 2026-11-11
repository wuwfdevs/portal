import { requireToolAccess } from "@/lib/auth/authz";
import { listCampaigns } from "@/lib/audience-listening/campaign-queries";
import { CAMPAIGN_STATUS_BADGE } from "@/lib/audience-listening/campaigns";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryLink, SecondaryLink, TextLink } from "@/components/ui/primary-link";
import { PlusIcon } from "@/components/ui/plus-icon";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { ListeningNav } from "../listening-nav";

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireToolAccess("audience-listening");
  const { error } = await searchParams;
  const rows = await listCampaigns();

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Campaigns"
        description="A season of listening: one question, the prompts a table is walked through, and the dates it runs. Events and tables belong to a campaign."
        actions={
          <>
            <SecondaryLink href="/audience-listening/consent">Consent wording</SecondaryLink>
            <PrimaryLink href="/audience-listening/campaigns/new" phoneIcon={<PlusIcon className="size-4" />}>
              New campaign
            </PrimaryLink>
          </>
        }
      />
      <ListeningNav current="campaigns" />
      {error && <Alert className="mb-4">{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState className="leading-relaxed">
          No campaigns yet. Start one with its question and its dates, add the prompts a table is asked, then schedule events inside it.
        </EmptyState>
      ) : (
        <TableFrame>
          <Table stack className="md:min-w-[760px]">
            <thead>
              <HeaderRow>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th>Runs</Th>
                <Th className="text-right">Events</Th>
                <Th className="text-right">Waiting for review</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {rows.map(({ campaign, eventCount, pendingReviewCount }) => {
                const badge = CAMPAIGN_STATUS_BADGE[campaign.status];
                return (
                  <Row key={campaign.id}>
                    <Cell stack="title">
                      <TextLink href={`/audience-listening/campaigns/${campaign.id}`} className="px-0 font-semibold">
                        {campaign.title}
                      </TextLink>
                      <p className="mt-0.5 max-w-md truncate text-xs text-ink-400">{campaign.question}</p>
                    </Cell>
                    <Cell stack="aside">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </Cell>
                    <Cell label="Runs" className="text-ink-500">
                      {campaign.opens_at ? formatEventTime(campaign.opens_at) : "No opening date"}
                      {campaign.closes_at ? ` to ${formatEventTime(campaign.closes_at)}` : ""}
                    </Cell>
                    <Cell label="Events" className="text-right text-ink-500">
                      {eventCount}
                    </Cell>
                    <Cell label="Waiting for review" className="text-right">
                      {pendingReviewCount > 0 ? <span className="font-semibold text-ink-900">{pendingReviewCount}</span> : <span className="text-ink-400">—</span>}
                    </Cell>
                  </Row>
                );
              })}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}
