import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { PageHeader } from "@/components/ui/page-header";
import { createCampaign } from "../../campaign-actions";
import { CampaignFields } from "../campaign-fields";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireToolAccess("audience-listening");
  const { error } = await searchParams;
  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="max-w-xl">
        <PageHeader
          className="mb-6"
          back={{ href: "/audience-listening/campaigns", label: "Back to campaigns" }}
          title="New campaign"
          description="This starts as a draft. Add the prompts a table is asked, then open it. Nothing is public until you do."
        />
        {error && <Alert className="mb-4">{error}</Alert>}
        <form action={createCampaign} className="flex flex-col gap-4">
          <CampaignFields showSlug />
          <FormActions cancelHref="/audience-listening/campaigns">
            <Button type="submit">Create campaign</Button>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
