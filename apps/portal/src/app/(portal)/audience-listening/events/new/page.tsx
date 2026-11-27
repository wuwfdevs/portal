import { redirect } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form-actions";
import { PageHeader } from "@/components/ui/page-header";
import { getQueryById } from "@/lib/audience-listening/queries";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { UUID_RE } from "@/lib/form-fields";
import { createEvent } from "../../event-actions";
import { EventFields } from "../event-fields";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ query?: string; error?: string }> }) {
  await requireToolAccess("audience-listening");
  const { query: queryId, error } = await searchParams;
  if (!queryId || !UUID_RE.test(queryId)) {
    redirect("/audience-listening?error=" + encodeURIComponent("Open a query and add the event from its Events tab."));
  }
  const query = await getQueryById(queryId);
  if (!query) redirect("/audience-listening?error=" + encodeURIComponent("That query no longer exists."));

  const backHref = `/audience-listening/${query.id}?tab=events`;
  const span = [query.opens_at && `from ${formatEventTime(query.opens_at)}`, query.closes_at && `to ${formatEventTime(query.closes_at)}`]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="max-w-xl">
        <PageHeader
          className="mb-6"
          back={{ href: backHref, label: `Back to ${query.internal_title}` }}
          title="New event"
          description={`For ${query.internal_title}. ${span ? `Its dates run ${span}.` : "It has no dates set, so an event can be any day."} The event starts as a draft; nothing is public.`}
        />
        {error && <Alert className="mb-4">{error}</Alert>}
        <form action={createEvent} className="flex flex-col gap-4">
          <input type="hidden" name="query_id" value={query.id} />
          <EventFields />
          <FormActions cancelHref={backHref}>
            <Button type="submit">Create event</Button>
          </FormActions>
        </form>
      </div>
    </div>
  );
}
