import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { listConsentTexts, listOpeningTexts } from "@/lib/audience-listening/event-queries";
import { getDisplayNames } from "@/lib/profile-names";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { addConsentText, addOpeningText } from "../wording-actions";
import { ListeningNav } from "../listening-nav";
import { WordingSection } from "./wording-section";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { isCoordinator } = await requireAudienceListeningContext();
  const { error } = await searchParams;
  const [consent, opening] = await Promise.all([listConsentTexts(), listOpeningTexts()]);
  const names = await getDisplayNames([...consent, ...opening].map((v) => v.created_by), { degrade: true });

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Consent and opening wording"
        description="What every table's recording is built on, the same for every query: the words a facilitator reads aloud, and what each person says on the recording."
      />
      <ListeningNav current="wording" />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex max-w-3xl flex-col gap-12">
        <WordingSection
          title="Group consent wording"
          empty="There is no wording yet, so no table can open: its page would have nothing to read aloud. A coordinator writes the first version."
          help="Settle the wording with the University's counsel and the records officer before the first real session. A version is never edited: a change is a new version, and tables already recorded keep the words their facilitator read. The facilitator's tap afterwards is the table's agreement, recorded with the version they were shown."
          fieldLabel="Words to read aloud"
          fieldHint="Up to 4,000 characters. Tables that open after you save use this version."
          maxLength={4000}
          versions={consent}
          names={names}
          isCoordinator={isCoordinator}
          action={addConsentText}
        />
        <WordingSection
          title="Opening of every recording"
          empty="There is no opening yet. Tables will start straight into the query's questions, with nothing on the tape saying who agreed."
          help="What each person says at the very start of the recording, so every voice agrees on the tape itself: for example their first name, where they live, and that they are okay being recorded. It is the same for every query and a reporter cannot change it. Settle it with the consent wording. A version is never edited, and each table records which version it was shown."
          fieldLabel="What each person says first"
          fieldHint="Up to 2,000 characters. Shown on the table's phone after the agreement, before the first question."
          maxLength={2000}
          versions={opening}
          names={names}
          isCoordinator={isCoordinator}
          action={addOpeningText}
        />
      </div>
    </div>
  );
}
