import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSourceworkContext } from "@/lib/sourcework/access";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { TextLink } from "@/components/ui/primary-link";
import { pluralize } from "@/lib/format";
import { getProjectById } from "@/lib/transcription/projects";
import { themePath, themeQuotesPath } from "@/lib/transcription/links";
import { getThemeDetail } from "@/lib/sourcework/theme-queries";
import { listQuoteSuggestions } from "@/lib/sourcework/quote-queries";
import { emptyQuotesMessage, quoteCounts } from "@/lib/sourcework/quotes";
import { AcceptAllQuotes } from "../../../bulk-accept-button";
import { QuoteList } from "./quote-list";

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
  await requireSourceworkContext();
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

  const quotes = await listQuoteSuggestions(themeId, sourceTitles);
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
            Theme · Waiting clips
          </p>
          <h1 className="mb-1 mt-1 font-serif text-xl font-bold text-ink-900 sm:text-2xl">
            {counts.waiting > 0
              ? `${pluralize(counts.waiting, "clip")} worth considering`
              : "No clips waiting for you"}
          </h1>
          <p className="max-w-[640px] text-sm text-ink-500">
            Left waiting by an earlier run on this theme. Each plays as it will cut. Accepting one
            saves it as an excerpt on its source.
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
            {waiting.length > 1 && <AcceptAllQuotes themeId={themeId} count={waiting.length} />}
            {waiting.length > 0 ? (
              <QuoteList quotes={waiting} />
            ) : (
              <EmptyState compact>{emptyQuotesMessage(counts)}</EmptyState>
            )}
          </div>

          <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
            <p className="text-[13px] text-ink-500">
              <strong className="text-ink-900">How these were chosen.</strong> The model cut each
              clip where the sentence works best. Playing a clip plays the original audio, so check
              the words as you accept.
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
