import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { getPurgePreview } from "@/lib/audience-listening/conversation-queries";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-action";
import { DescriptionList } from "@/components/ui/description-list";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { runPurge } from "../conversation-actions";
import { ListeningNav } from "../listening-nav";

export default async function PurgePage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { isCoordinator } = await requireAudienceListeningContext();
  const { error, done } = await searchParams;
  const preview = await getPurgePreview();
  const [doneSubmissions, doneConversations, doneAudio] = (done ?? "").split("-").map(Number);
  const nothingDue = preview.submissions + preview.conversations === 0;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Purge what is due"
        description="Unfinished work is deleted after 30 days. Nothing purges on its own: the Portal has no background jobs, so a coordinator runs this."
      />
      <ListeningNav current="campaigns" />
      {error && <Alert className="mb-4">{error}</Alert>}
      {done && Number.isFinite(doneSubmissions) && (
        <Alert variant="note" className="mb-4">
          Purged {doneSubmissions} unfinished submission{doneSubmissions === 1 ? "" : "s"} and {doneConversations} unsent conversation
          {doneConversations === 1 ? "" : "s"}, and removed {doneAudio} audio file{doneAudio === 1 ? "" : "s"}.
        </Alert>
      )}

      <div className="flex max-w-3xl flex-col gap-6">
        <Card className="p-5">
          <SectionHeading className="mb-3">Due now</SectionHeading>
          <DescriptionList
            items={[
              { label: "Unfinished submissions", value: `${preview.submissions} (answers and audio, untouched for 30 days)` },
              { label: "Unsent conversations", value: `${preview.conversations} (segments, voices, marks and contact cards, 30 days after the event ended)` },
              { label: "Contact cards among them", value: String(preview.cards) },
              {
                label: "Kept for now",
                value:
                  preview.held === 0
                    ? "None"
                    : `${preview.held} old unsent conversation${preview.held === 1 ? "" : "s"}, because someone has already been contacted or a name approved from a card in ${preview.held === 1 ? "it" : "them"}. That card is the record of what the person agreed to.`,
              },
            ]}
          />
          <div className="mt-4">
            {isCoordinator ? (
              <form action={runPurge}>
                <ConfirmSubmit
                  trigger="button"
                  label="Purge what is due"
                  confirmLabel="Yes, delete them"
                  message="This deletes the records and their audio for good. A conversation the facilitator sent is never purged here."
                />
              </form>
            ) : (
              <p className="text-sm text-ink-500">Only a coordinator can run the purge.</p>
            )}
            {nothingDue && <p className="mt-2 text-xs text-ink-400">Nothing is due.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <SectionHeading className="mb-2">Not purged here</SectionHeading>
          <p className="text-sm text-ink-500">
            Contact cards are kept until a campaign&apos;s report is published plus 12 months, and raw audio of material never used for 24 months after
            it, unless the records officer sets a different schedule. Campaign reports do not exist yet, so neither is due. The Portal does not
            guess a date for them.
          </p>
        </Card>
      </div>
    </div>
  );
}
