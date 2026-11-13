import { Field, Input, Textarea } from "@/components/ui/input";
import { utcToStationInput } from "@/lib/audience-listening/event-times";
import type { AlCampaign } from "@/lib/audience-listening/campaign-queries";

/** The fields a campaign is made and edited with. The page's form owns the <form> and its footer. */
export function CampaignFields({ campaign, showSlug }: { campaign?: AlCampaign; showSlug: boolean }) {
  return (
    <>
      <Field label="Title" htmlFor="title" hint="What staff call it. The public never sees the word campaign.">
        <Input id="title" name="title" required maxLength={200} defaultValue={campaign?.title ?? ""} placeholder="Housing, fall season" />
      </Field>
      <Field label="The question" htmlFor="question" hint="The one question this season asks, in the words a table will hear.">
        <Input id="question" name="question" required maxLength={500} defaultValue={campaign?.question ?? ""} placeholder="How is the cost of housing changing your life here?" />
      </Field>
      <Field label="Introduction" htmlFor="intro" hint="Why you are asking and what you will do with what you hear. Shown on the website.">
        <Textarea id="intro" name="intro" rows={4} maxLength={4000} defaultValue={campaign?.intro ?? ""} />
      </Field>
      {showSlug && (
        <Field
          label="Short name"
          htmlFor="slug"
          hint="Lowercase letters, digits and hyphens. Leave it blank on a new campaign to make it from the title."
        >
          <Input id="slug" name="slug" maxLength={60} defaultValue={campaign?.slug ?? ""} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
      )}
      <Field label="From" htmlFor="owner_label" hint={'How the website says who is asking, for example "from the WUWF News desk". Optional.'}>
        <Input id="owner_label" name="owner_label" maxLength={120} defaultValue={campaign?.owner_label ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opens" htmlFor="opens_at" hint="In the station's time. Events have to start on or after this.">
          <Input id="opens_at" name="opens_at" type="datetime-local" defaultValue={utcToStationInput(campaign?.opens_at)} />
        </Field>
        <Field label="Closes" htmlFor="closes_at" hint="Events have to start on or before this.">
          <Input id="closes_at" name="closes_at" type="datetime-local" defaultValue={utcToStationInput(campaign?.closes_at)} />
        </Field>
      </div>
    </>
  );
}
