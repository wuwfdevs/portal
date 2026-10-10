import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSourceworkContext } from "@/lib/sourcework/access";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/primary-link";
import { pluralize } from "@/lib/format";
import { getProjectById } from "@/lib/transcription/projects";
import { themePath, themeQuotesPath } from "@/lib/transcription/links";
import { getLivePrompt } from "@/lib/sourcework/research-queries";
import { getThemeDetail } from "@/lib/sourcework/theme-queries";
import { hasQuoteRun, listQuoteSuggestions } from "@/lib/sourcework/quote-queries";
import { emptyQuotesMessage, guideBlocks, quoteCounts } from "@/lib/sourcework/quotes";
import { QuoteList } from "./quote-list";
import { QuotesRunControls } from "./run-controls";

/**
 * A theme's suggested quotes (docs/sourcework-analysis-design.md §5.5): the clips the model chose
 * from the theme's supporting evidence and the transcript around it, one card each to play, trim,
 * accept or reject. Accepting saves the clip as an excerpt on its source.
 */
export default async function ThemeQuotesPage({
  params,
}: {
  params: Promise<{ id: string; themeId: string }>;
}) {
  const context = await requireSourceworkContext();
  const { id, themeId } = await params;

  const project = await getProjectById(id);
  if (!project) notFound();
  const sourceTitles = new Map(
    project.sources.map((entry) => [entry.sourceId, entry.source.title]),
  );

  const detail = await getThemeDetail(id, themeId, sourceTitles);
  if (!detail) notFound();
  if (detail.mergedIntoId) redirect(themeQuotesPath(id, detail.mergedIntoId));
  const { theme } = detail;
  const backHref = themePath(id, themeId);

  const [quotes, ran, guide] = await Promise.all([
    listQuoteSuggestions(themeId, sourceTitles),
    hasQuoteRun(themeId),
    getLivePrompt("quote_quality"),
  ]);
  const counts = quoteCounts(quotes);
  const waiting = quotes.filter((quote) => quote.status === "suggested");
  const accepted = theme.status === "accepted";

  return (
    <div className="px-4 py-8 sm:px-10 sm:py-10 lg:px-12">
      <div className="mb-4">
        <TextLink href={backHref}>← {theme.title}</TextLink>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400 sm:text-xs">
            Theme · Suggested quotes
          </p>
          <h1 className="mb-1 mt-1 font-serif text-xl font-bold text-ink-900 sm:text-2xl">
            {counts.waiting > 0
              ? `${pluralize(counts.waiting, "clip")} worth considering`
              : "No clips waiting for you"}
          </h1>
          <p className="max-w-[640px] text-sm text-ink-500">
            Chosen from this theme’s supporting data points, with the transcript around them. Each
            plays as it will cut. Accepting one saves it as an excerpt on its source.
          </p>
        </div>
      </div>

      {!accepted ? (
        <div className="mt-6 max-w-[640px]">
          <Alert variant="warning">
            Quotes are suggested for accepted themes.{" "}
            <Link href={backHref} className="font-bold underline">
              Open the theme
            </Link>{" "}
            to accept it first.
          </Alert>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6 lg:mt-[26px] lg:flex-row lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <QuotesRunControls
              projectId={id}
              themeId={themeId}
              label={counts.waiting > 0 || ran ? "Suggest quotes again" : "Suggest quotes"}
            />
            {waiting.length > 0 ? (
              <QuoteList quotes={waiting} />
            ) : (
              <EmptyState compact>{emptyQuotesMessage(counts, ran)}</EmptyState>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
            <section className="rounded border border-line bg-white">
              <div className="flex items-baseline border-b border-line px-5 py-3 text-sm font-bold text-ink-900">
                <span className="flex-1">Quote quality guide</span>
                <span className="text-xs font-normal text-ink-400">
                  {guide.version === null ? "Built-in" : `Live · v${guide.version}`}
                </span>
              </div>
              <div className="flex flex-col gap-2 px-5 py-3.5 text-[13px] text-ink-700">
                {guideBlocks(guide.body).map((block, index) =>
                  block.kind === "list" ? (
                    <ul key={index} className="list-disc space-y-1.5 pl-[18px]">
                      {block.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={index}>{block.text}</p>
                  ),
                )}
              </div>
              <div className="border-t border-line px-5 py-2.5 text-xs text-ink-500">
                Editors maintain this wording.{" "}
                {context.isEditor ? (
                  <Link
                    href="/sourcework/editors?slot=quote_quality"
                    className="font-bold text-brand-link hover:underline"
                  >
                    Edit guide
                  </Link>
                ) : null}
              </div>
            </section>

            <p className="text-[13px] text-ink-500">
              <strong className="text-ink-900">How these were chosen.</strong> The model read each
              supporting data point with the transcript around it, not only the paraphrase, and cut
              each clip where the sentence works best. Playing a clip plays the original audio, so
              check the words as you accept.
            </p>
            <p className="border-t border-line pt-3 text-[13px] text-ink-500">
              Accepted for this theme so far:{" "}
              <strong className="text-ink-900">{counts.accepted}</strong> · Rejected:{" "}
              <strong className="text-ink-900">{counts.rejected}</strong>
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
