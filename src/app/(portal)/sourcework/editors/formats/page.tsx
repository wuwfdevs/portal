import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineCreateCard } from "@/components/ui/inline-create-card";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { getDisplayNames } from "@/lib/profile-names";
import { requireSourceworkEditor } from "@/lib/sourcework/access";
import { FORMAT_NAME_MAX, blankSpec } from "@/lib/sourcework/piece-formats";
import { getFormatEditorData, listFormatsForEditors } from "@/lib/sourcework/piece-format-queries";
import { uuidParam } from "@/lib/sourcework/route-input";
import { SourceworkTabs } from "../../sourcework-tabs";
import { EditorsSubNav } from "../editors-sub-nav";
import { SlotSelect } from "../slot-select";
import { createFormat } from "./actions";
import { FormatEditor } from "./format-editor";

export const metadata = { title: "Piece formats" };

/**
 * Piece formats (docs/sourcework-analysis-design.md §6.3): what Draft with AI follows. Editors
 * only. The list of formats beside the editor (a select on a phone), "+ New format" as an
 * inline card (`?new=1`), and the editor for the chosen one.
 */
export default async function FormatsPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; new?: string; error?: string }>;
}) {
  const context = await requireSourceworkEditor();
  if (!context) notFound();
  const params = await searchParams;
  const formats = await listFormatsForEditors();
  const creating = params.new === "1";
  const chosenId = uuidParam(params.format) ?? formats[0]?.id ?? null;
  const data = chosenId ? await getFormatEditorData(chosenId, context.profile.id) : null;
  if (chosenId && params.format && !data) notFound();
  const names = data
    ? await getDisplayNames(
        data.versions.flatMap((version) => (version.createdBy ? [version.createdBy] : [])),
        { degrade: true },
      )
    : new Map<string, string>();

  const newCard = (
    <InlineCreateCard
      title="New piece format"
      action={createFormat}
      submitLabel="Create format"
      cancelHref={`/sourcework/editors/formats${chosenId ? `?format=${chosenId}` : ""}`}
      className="mb-6 max-w-xl"
    >
      <Label htmlFor="format-name">Name</Label>
      <Input
        id="format-name"
        name="name"
        required
        maxLength={FORMAT_NAME_MAX}
        placeholder="Feature"
        autoFocus
      />
      <p className="mt-1.5 text-xs text-ink-400">
        It starts as a draft only you can see. Reporters can draft from it once you publish it.
      </p>
      {params.error && (
        <Alert variant="danger" className="mt-3">
          {params.error}
        </Alert>
      )}
    </InlineCreateCard>
  );

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <PageHeader
        size="page"
        title="Sourcework"
        description="Setup: the wording the model works from. Everyone's next draft uses the live version."
        className="mb-8"
      />
      <SourceworkTabs active="setup" isEditor className="mb-3" />
      <EditorsSubNav active="formats" className="mb-6" />

      {creating && newCard}

      {formats.length === 0 ? (
        !creating && (
          <EmptyState>
            No piece formats yet.{" "}
            <Link href="/sourcework/editors/formats?new=1" className="font-bold text-brand-link">
              + New format
            </Link>
          </EmptyState>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 lg:hidden">
            <SlotSelect
              slots={formats.map((format) => ({ slot: format.id, label: format.name }))}
              value={chosenId ?? ""}
              path="/sourcework/editors/formats"
              param="format"
              label="Piece format"
            />
            {!creating && (
              <Link
                href="/sourcework/editors/formats?new=1"
                className="min-h-11 py-2 text-sm font-bold text-brand-link"
              >
                + New format
              </Link>
            )}
          </div>

          <div className="flex items-start gap-10">
            <nav
              aria-label="Piece formats"
              className="hidden w-52 shrink-0 flex-col gap-0.5 text-sm lg:flex"
            >
              {formats.map((format) => (
                <Link
                  key={format.id}
                  href={`/sourcework/editors/formats?format=${format.id}`}
                  aria-current={format.id === chosenId ? "page" : undefined}
                  className={cn(
                    "rounded px-3 py-2",
                    format.id === chosenId
                      ? "bg-brand-surface font-bold text-brand-link"
                      : "text-ink-700 hover:bg-panel-50",
                  )}
                >
                  {format.name}
                  {format.liveVersion === null && (
                    <span className="ml-1 text-xs font-normal text-ink-400">· not published</span>
                  )}
                </Link>
              ))}
              {!creating && (
                <Link
                  href="/sourcework/editors/formats?new=1"
                  className="px-3 py-2 font-bold text-brand-link"
                >
                  + New format
                </Link>
              )}
            </nav>

            {data && (
              <div className="min-w-0 max-w-3xl flex-1">
                <FormatEditor
                  // Keyed by format so switching starts a fresh editor with its own draft.
                  key={data.id}
                  formatId={data.id}
                  name={data.name}
                  initialSpec={data.draft?.spec ?? data.live?.spec ?? blankSpec()}
                  savedDraftAt={data.draft?.updatedAt ?? null}
                  liveSpec={data.live?.spec ?? null}
                  liveVersion={data.live?.version ?? null}
                  versions={data.versions.map((version) => ({
                    id: version.id,
                    version: version.version,
                    spec: version.spec,
                    note: version.note,
                    createdAt: version.createdAt,
                    byName: version.createdBy ? (names.get(version.createdBy) ?? null) : "Built in",
                    isLive: version.isLive,
                    piecesMade: version.piecesMade,
                  }))}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
