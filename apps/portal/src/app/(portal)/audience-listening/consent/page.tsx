import { requireAudienceListeningContext } from "@/lib/audience-listening/access";
import { listConsentTexts } from "@/lib/audience-listening/campaign-queries";
import { getDisplayNames } from "@/lib/profile-names";
import { formatEventTime } from "@/lib/audience-listening/event-times";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { addConsentText } from "../campaign-actions";
import { ListeningNav } from "../listening-nav";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { isCoordinator } = await requireAudienceListeningContext();
  const { error } = await searchParams;
  const versions = await listConsentTexts();
  const names = await getDisplayNames(versions.map((v) => v.created_by), { degrade: true });
  const current = versions[0];

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        className="mb-8"
        title="Group consent wording"
        description="The words a facilitator reads aloud before a table records. Their tap afterwards is the table's agreement, recorded with the version they were shown."
      />
      <ListeningNav current="campaigns" />
      {error && <Alert className="mb-4">{error}</Alert>}

      <div className="flex max-w-3xl flex-col gap-6">
        {!current && (
          <Alert variant="note">
            There is no wording yet, so no table can open: its page would have nothing to read aloud. A coordinator writes the first version.
          </Alert>
        )}
        <Alert variant="note">
          Settle the wording with the University&apos;s counsel and the records officer before the first real session. A version is never edited:
          a change is a new version, and tables already recorded keep the words their facilitator read.
        </Alert>

        {current && (
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
              <SectionHeading>Version {current.version}</SectionHeading>
              <Badge variant="success">In use</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-900">{current.body}</p>
            <p className="mt-3 text-xs text-ink-400">
              Added {formatEventTime(current.created_at)}
              {current.created_by && names.get(current.created_by) ? ` by ${names.get(current.created_by)}` : ""}
            </p>
          </Card>
        )}

        {isCoordinator ? (
          <Card className="p-5">
            <SectionHeading className="mb-4">{current ? "Add a new version" : "Add the first version"}</SectionHeading>
            <form action={addConsentText} className="flex flex-col gap-3">
              <Field label="Words to read aloud" htmlFor="body" hint="Up to 4,000 characters. Tables that open after you save use this version.">
                <Textarea id="body" name="body" rows={8} required maxLength={4000} defaultValue={current?.body ?? ""} />
              </Field>
              <FormActions>
                <Button type="submit">Save as version {(current?.version ?? 0) + 1}</Button>
              </FormActions>
            </form>
          </Card>
        ) : (
          <p className="text-sm text-ink-500">Only a coordinator can add a version.</p>
        )}

        {versions.length > 1 && (
          <Card className="p-5">
            <SectionHeading className="mb-3">Earlier versions</SectionHeading>
            <ul className="flex flex-col gap-4">
              {versions.slice(1).map((v) => (
                <li key={v.id}>
                  <p className="text-xs font-semibold text-ink-500">
                    Version {v.version} · {formatEventTime(v.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{v.body}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
