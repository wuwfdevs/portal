import { redirect } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { PageHeader } from "@/components/ui/page-header";
import { getCampaign } from "@/lib/audience-listening/campaign-queries";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { UUID_RE } from "@/lib/form-fields";
import { createEvent } from "../../event-actions";
import { EventFields } from "../event-fields";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ campaign?: string; error?: string }> }) {
  await requireToolAccess("audience-listening");
  const { campaign: campaignId, error } = await searchParams;
  if (!campaignId || !UUID_RE.test(campaignId)) {
    redirect("/audience-listening/campaigns?error=" + encodeURIComponent("Open a campaign and add the event from its Events tab."));
  }
  const campaign = await getCampaign(campaignId);
  if (!campaign) redirect("/audience-listening/campaigns?error=" + encodeURIComponent("That campaign no longer exists."));

  const backHref = `/audience-listening/campaigns/${campaign.id}?tab=events`;
  const span = [campaign.opens_at && `from ${formatEventTime(campaign.opens_at)}`, campaign.closes_at && `to ${formatEventTime(campaign.closes_at)}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="max-w-xl">
        <PageHeader
          className="mb-6"
          back={{ href: backHref, label: `Back to ${campaign.title}` }}
          title="New event"
          description={`For ${campaign.title}. ${span ? `Its dates run ${span}.` : "It has no dates set, so an event can be any day."} The event starts as a draft; nothing is public.`}
        />
        {error && <Alert className="mb-4">{error}</Alert>}
        <form action={createEvent} className="flex flex-col gap-4">
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <EventFields />
          <FormActions cancelHref={backHref}>
            <Button type="submit">Create event</Button>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
