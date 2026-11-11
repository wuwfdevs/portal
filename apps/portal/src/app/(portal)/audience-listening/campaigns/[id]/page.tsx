import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { TabNav } from "@/components/ui/tab-nav";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  getCampaign,
  getOwnerName,
  listEvents,
  listLinkableQueries,
  listPrompts,
  listTags,
} from "@/lib/audience-listening/campaign-queries";
import { CAMPAIGN_ACTION_LABEL, CAMPAIGN_STATUS_BADGE, availableCampaignActions } from "@/lib/audience-listening/campaigns";
import { setCampaignStatus } from "../../campaign-actions";
import { EventsTab } from "./events-tab";
import { PromptsTab } from "./prompts-tab";
import { SettingsTab } from "./settings-tab";

const TABS = ["prompts", "events", "settings"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { prompts: "Prompts and tags", events: "Events", settings: "Settings" };

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const { id } = await params;
  const { tab, error } = await searchParams;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  const activeTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "prompts";

  const [prompts, tags, events, queries, ownerName] = await Promise.all([
    listPrompts(id),
    listTags(id),
    listEvents({ campaignId: id }),
    listLinkableQueries(campaign.query_id),
    getOwnerName(campaign.owner_id),
  ]);
  const badge = CAMPAIGN_STATUS_BADGE[campaign.status];

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        className="mb-6"
        back={{ href: "/audience-listening/campaigns", label: "Back to campaigns" }}
        title={campaign.title}
        badge={<Badge variant={badge.variant}>{badge.label}</Badge>}
        description={campaign.question}
        actions={availableCampaignActions(campaign.status).map((action) => (
          <form key={action} action={setCampaignStatus}>
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <input type="hidden" name="action" value={action} />
            <Button type="submit" variant={action === "open" ? "primary" : "secondary"}>
              {CAMPAIGN_ACTION_LABEL[action]}
            </Button>
          </form>
        ))}
      />

      {error && <Alert className="mb-4">{error}</Alert>}
      {campaign.status === "draft" && (
        <Alert variant="note" className="mb-6">
          This campaign is a draft. Add its prompts, then open it. Closing a campaign also closes its linked query.
        </Alert>
      )}

      <TabNav
        tabs={TABS.map((candidate) => ({
          href: `/audience-listening/campaigns/${campaign.id}?tab=${candidate}`,
          label: candidate === "events" && events.length > 0 ? `${TAB_LABEL[candidate]} (${events.length})` : TAB_LABEL[candidate],
          active: candidate === activeTab,
        }))}
      />

      {activeTab === "prompts" && <PromptsTab campaign={campaign} prompts={prompts} tags={tags} />}
      {activeTab === "events" && <EventsTab campaign={campaign} events={events} />}
      {activeTab === "settings" && <SettingsTab campaign={campaign} queries={queries} ownerName={ownerName} eventCount={events.length} />}
    </div>
  );
}
