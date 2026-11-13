import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Select, Textarea } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import type { AlCampaign } from "@/lib/audience-listening/campaign-queries";
import { deleteCampaign, updateCampaign } from "../../campaign-actions";
import { CampaignFields } from "../campaign-fields";

export function SettingsTab({
  campaign,
  queries,
  ownerName,
  eventCount,
}: {
  campaign: AlCampaign;
  queries: { id: string; title: string }[];
  ownerName: string | null;
  eventCount: number;
}) {
  const canDelete = campaign.status === "draft" && eventCount === 0;
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <form action={updateCampaign} className="flex flex-col gap-4">
        <input type="hidden" name="campaign_id" value={campaign.id} />
        <CampaignFields campaign={campaign} showSlug />
        <Field
          label="Linked query"
          htmlFor="query_id"
          hint="Optional. The same question answered alone, by anyone, without coming to a table. Closing the campaign closes it."
        >
          <Select id="query_id" name="query_id" defaultValue={campaign.query_id ?? ""}>
            <option value="">None</option>
            {queries.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Private notes" htmlFor="internal_notes" hint={ownerName ? `Staff only. Started by ${ownerName}.` : "Staff only."}>
          <Textarea id="internal_notes" name="internal_notes" rows={3} maxLength={4000} defaultValue={campaign.internal_notes ?? ""} />
        </Field>
        <FormActions>
          <Button type="submit">Save</Button>
        </FormActions>
      </form>

      <Card className="p-5">
        <SectionHeading className="mb-2">Delete</SectionHeading>
        {canDelete ? (
          <form action={deleteCampaign}>
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <ConfirmSubmit label="Delete this draft" confirmLabel="Yes, delete it" message="This removes the draft campaign and its prompts and tags for good." />
          </form>
        ) : (
          <p className="text-sm text-ink-500">
            Only a draft with no events can be deleted. A campaign that ran is closed and archived instead, so what it heard stays on the record.
          </p>
        )}
      </Card>
    </div>
  );
}
