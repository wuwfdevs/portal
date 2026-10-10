import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { getDisplayNames } from "@/lib/profile-names";
import { requireSourceworkEditor } from "@/lib/sourcework/access";
import {
  PROMPT_SLOTS,
  acceptRateLabel,
  promptSlotDefinition,
  type PromptSlot,
} from "@/lib/sourcework/prompts";
import {
  getExtractionAcceptRates,
  getLivePrompt,
  getPromptDraft,
  getThemeAcceptRates,
  listPromptVersions,
} from "@/lib/sourcework/research-queries";
import { initialPromptText } from "@/lib/sourcework/trial-sample";
import { PromptEditor } from "./prompt-editor";
import { SlotSelect } from "./slot-select";

export const metadata = { title: "Research prompts" };

export default async function EditorsPage({
  searchParams,
}: {
  searchParams: Promise<{ slot?: string }>;
}) {
  const context = await requireSourceworkEditor();
  if (!context) notFound();
  const params = await searchParams;
  const definition = promptSlotDefinition(params.slot) ?? promptSlotDefinition("extraction")!;
  const slot: PromptSlot = definition.slot;

  const [live, versions, draft] = await Promise.all([
    getLivePrompt(slot),
    listPromptVersions(slot),
    getPromptDraft(slot, context.profile.id),
  ]);
  const names = await getDisplayNames(
    versions.map((version) => version.createdBy),
    { degrade: true },
  );

  // The accept rate means something for the slots whose output a person accepts or rejects: the
  // extraction guide's data points and Review themes' themes. The built-in text has a rate of its
  // own, keyed by null.
  let liveRate: string | null = null;
  if (slot === "extraction" || slot === "theme_review") {
    if (live.versionId) {
      const current = versions.find((version) => version.id === live.versionId);
      liveRate = current ? acceptRateLabel(current.accepted, current.rejected) : null;
    } else {
      const rates =
        slot === "extraction" ? await getExtractionAcceptRates() : await getThemeAcceptRates();
      const builtIn = rates.get(null);
      liveRate = builtIn ? acceptRateLabel(builtIn.accepted, builtIn.rejected) : null;
    }
  }

  const slots = PROMPT_SLOTS.map(({ slot: value, label }) => ({ slot: value, label }));

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        back={{ href: "/sourcework", label: "Back to projects" }}
        title="Research prompts"
        description="The wording the model works from. Everyone's next run uses the live version."
        className="mb-6"
      />

      <div className="mb-4 lg:hidden">
        <SlotSelect slots={slots} value={slot} />
      </div>

      <div className="flex items-start gap-10">
        <nav aria-label="Prompts" className="hidden w-52 shrink-0 flex-col gap-0.5 text-sm lg:flex">
          {slots.map((entry) => (
            <Link
              key={entry.slot}
              href={`/sourcework/editors?slot=${entry.slot}`}
              aria-current={entry.slot === slot ? "page" : undefined}
              className={cn(
                "rounded px-3 py-2",
                entry.slot === slot
                  ? "bg-brand-surface font-bold text-brand-link"
                  : "text-ink-700 hover:bg-panel-50",
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        <div className="min-w-0 max-w-3xl flex-1">
          <h2 className="font-serif text-xl font-bold text-ink-900">{definition.label}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{definition.description}</p>
          <details className="group mb-4 mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-bold text-brand-link lg:min-h-0 lg:py-0">
              What the model is given and returns
            </summary>
            <div className="mt-2 grid gap-4 rounded border border-line bg-panel-50 p-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                  Given
                </h3>
                <ul className="list-disc space-y-1.5 pl-4 text-ink-700">
                  {definition.gives.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                  Returns
                </h3>
                <ul className="list-disc space-y-1.5 pl-4 text-ink-700">
                  {definition.returns.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>

          {/* Keyed by slot so switching prompts starts a fresh editor with its own draft. */}
          <PromptEditor
            key={slot}
            slot={slot}
            tryable={definition.tryable}
            initialText={initialPromptText({
              draft: draft?.body ?? null,
              live: live.versionId ? live.body : null,
              builtIn: definition.builtIn,
            })}
            savedDraftAt={draft?.updatedAt ?? null}
            liveBody={live.body}
            liveVersion={live.version}
            liveRate={liveRate}
            versions={versions.map((version) => ({
              id: version.id,
              version: version.version,
              body: version.body,
              note: version.note,
              createdAt: version.createdAt,
              byName: names.get(version.createdBy) ?? null,
              accepted: version.accepted,
              rejected: version.rejected,
              isLive: version.isLive,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
