import Link from "next/link";
import { ActionMenu } from "@/components/ui/action-menu";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ControlRow } from "@/components/ui/control-row";
import { DismissibleHint } from "@/components/ui/dismissible-hint";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChips } from "@/components/ui/filter-chips";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/primary-link";
import { cn } from "@/lib/cn";
import { formatShortDateTime, pluralize } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import { projectPath, sourcePath } from "@/lib/transcription/links";
import { listResearchQuestions } from "@/lib/sourcework/research-queries";
import {
  CERTAINTIES,
  CERTAINTY_LABEL,
  findingsChangedSince,
  isPassagesOnly,
  newThemeIds,
  supportBreadth,
  unsupportedIds,
  type Certainty,
  type CitedFindingInfo,
  type NarrativeNote,
  type SynthesisBody,
  type SynthesisOrigin,
} from "@/lib/sourcework/synthesis";
import {
  getCurrentSynthesis,
  getSourceTitles,
  getSynthesisVersion,
  isSynthesisRunning,
  listAcceptedFindings,
  listSynthesisVersions,
} from "@/lib/sourcework/synthesis-queries";
import {
  buildEvidence,
  meterDots,
  type EvidencePayload,
} from "@/lib/sourcework/synthesis-evidence";
import {
  SECTION_ANCHORS,
  diffLine,
  diffSynthesis,
  previousRunVersion,
  questionAnchor,
  summarizeSynthesis,
  type SynthesisSummary,
} from "@/lib/sourcework/synthesis-summary";
import {
  CERTAINTY_VARIANT,
  breadthLine,
  synthesisIntro,
  synthesizeButtonLabel,
} from "@/lib/sourcework/synthesis-view";
import { EvidenceButton, EvidenceCard, EvidencePanel, EvidenceProvider } from "./evidence-panel";
import { ProcessingPoller } from "./processing-poller";
import { DismissThemeButton, TrackItemButton } from "./synthesis-item-actions";
import { SynthesizeButton } from "./synthesize-button";

/**
 * The Synthesis tab (docs/sourcework-analysis-design.md §21): what the project's accepted findings
 * establish for each research question, how firmly, where accounts conflict and what is still open.
 * It is a reading aid over the findings, never evidence in itself: every statement opens onto the
 * findings it rests on (the evidence panel), and onto the passages they came from.
 *
 * Layout: a header that holds the version and the one action, a summary of the whole answer, then
 * a section list, the answer, and the evidence panel side by side from `lg`.
 */
export async function SynthesisTab({
  projectId,
  versionParam,
  certParam,
}: {
  projectId: string;
  versionParam?: string;
  certParam?: string;
}) {
  const requested = Number.parseInt(versionParam ?? "", 10);
  const [questions, { findings, truncated }, current, versions, running] = await Promise.all([
    listResearchQuestions(projectId),
    listAcceptedFindings(projectId),
    getCurrentSynthesis(projectId),
    listSynthesisVersions(projectId),
    isSynthesisRunning(projectId),
  ]);
  const activeQuestions = questions.filter((question) => question.archivedAt === null);
  const shown =
    Number.isInteger(requested) && requested >= 1 && requested !== current?.version
      ? await getSynthesisVersion(projectId, requested)
      : current;
  const viewingOlder = shown !== null && current !== null && shown.version !== current.version;
  const certFilter = (CERTAINTIES as readonly string[]).includes(certParam ?? "")
    ? (certParam as Certainty)
    : null;

  const baselineVersion = shown ? previousRunVersion(versions, shown.version) : null;
  const baseline =
    baselineVersion !== null ? await getSynthesisVersion(projectId, baselineVersion) : null;

  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const acceptedIds = new Set(findingById.keys());
  const changedSince =
    current === null
      ? 0
      : findingsChangedSince(
          findings.map((finding) => finding.updatedAt),
          current.createdAt,
        );
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const info = new Map<string, CitedFindingInfo>(
    findings.map((finding) => [
      finding.id,
      { sourceId: finding.sourceId, speakerId: finding.speakerId },
    ]),
  );
  const unsupported = shown ? unsupportedIds(shown.body, acceptedIds) : new Set<string>();

  // Titles for passages in a source that has no accepted finding to borrow one from.
  const titleBySource = new Map(findings.map((finding) => [finding.sourceId, finding.sourceTitle]));
  if (shown) {
    const missing = [
      ...shown.body.emerging.flatMap((theme) => theme.passages),
      ...shown.body.narrative.flatMap((note) => note.passages),
    ]
      .map((passage) => passage.sourceId)
      .filter((id) => !titleBySource.has(id));
    for (const [id, title] of await getSourceTitles(missing)) titleBySource.set(id, title);
  }

  const summary = shown ? summarizeSynthesis(shown.body, unsupported) : null;
  const diff =
    shown && baseline && baselineVersion !== null
      ? diffLine(diffSynthesis(baseline.body, shown.body), baselineVersion)
      : null;
  const freshThemes = shown ? newThemeIds(baseline?.body ?? null, shown.body) : new Set<string>();

  const evidence = (key: string, heading: string, cites: readonly string[]): EvidencePayload =>
    buildEvidence({ key, heading, cites, projectId, findingById });

  const canEdit = shown !== null && !viewingOlder;
  const sourceCount = new Set(findings.map((finding) => finding.sourceId)).size;

  // The version menu shares a row with Synthesize again; alone when reading an older version.
  const versionsMenu =
    versions.length > 1 ? (
      <ActionMenu
        label="Versions"
        triggerLabel={
          <>
            Version {shown?.version ?? current?.version}
            {!viewingOlder ? " · latest" : ""} ▾
          </>
        }
        sheetHeading="Versions"
        items={versions.map((version) => ({
          label: `Version ${version.version} · ${formatShortDateTime(version.createdAt)} · ${
            version.savedVia === "person" ? "edited by a person" : "written by a run"
          }${version.version === current?.version ? " · latest" : ""}`,
          href:
            version.version === current?.version
              ? projectPath(projectId, "synthesis")
              : `${projectPath(projectId, "synthesis")}&version=${version.version}`,
        }))}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {running && <ProcessingPoller />}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          {shown ? (
            <p className="text-sm text-ink-600">
              Version {shown.version} · written {formatShortDateTime(shown.createdAt)}{" "}
              {shown.savedVia === "person" ? "after a person's edit" : "by a run"} · reads{" "}
              {pluralize(findings.length, "accepted finding")} from{" "}
              {pluralize(sourceCount, "source")}
            </p>
          ) : (
            <p className="text-sm text-ink-600">
              {synthesisIntro({
                acceptedFindings: findings.length,
                questionCount: activeQuestions.length,
                hasSynthesis: false,
              })}
            </p>
          )}
          {diff && !viewingOlder && <p className="mt-1 text-sm text-ink-500">{diff}</p>}
        </div>

        {findings.length > 0 && current && changedSince > 0 && !viewingOlder && (
          <Badge variant="warning" title="Accepted findings edited after this version was written">
            {pluralize(changedSince, "finding")} changed since
          </Badge>
        )}
      </div>

      {findings.length > 0 &&
        (viewingOlder ? (
          versionsMenu && <ControlRow>{versionsMenu}</ControlRow>
        ) : (
          <SynthesizeButton
            projectId={projectId}
            label={synthesizeButtonLabel(current !== null, changedSince)}
            alreadyRunning={running}
            controls={versionsMenu}
          />
        ))}
      {shown && !viewingOlder && (
        <DismissibleHint id="synthesis-intro">
          Each statement opens onto the findings behind it. Synthesize again after you accept new
          findings: a new version is written and earlier ones stay in the version list.
        </DismissibleHint>
      )}
      {truncated && (
        <Alert variant="warning">
          This project has more accepted findings than one synthesis can read. The oldest{" "}
          {findings.length} were used.
        </Alert>
      )}
      {viewingOlder && shown && (
        <Alert
          variant="note"
          action={
            <TextLink href={projectPath(projectId, "synthesis")}>Back to the latest</TextLink>
          }
        >
          You are reading version {shown.version}, written {formatShortDateTime(shown.createdAt)}.
          It is kept for reference, and cannot be changed.
        </Alert>
      )}

      {shown === null ? (
        findings.length > 0 ? (
          <EmptyState title="No synthesis yet">
            Choose Synthesize to have the accepted findings read together.
          </EmptyState>
        ) : (
          <EmptyState
            title="No accepted findings yet"
            action={
              <TextLink href={projectPath(projectId)}>Go to Sources and Analyze one</TextLink>
            }
          >
            Synthesis reads the findings you have accepted. Analyze a source, accept what is worth
            keeping, then come back.
          </EmptyState>
        )
      ) : (
        <EvidenceProvider projectId={projectId}>
          {summary && (
            <SummaryStrip
              summary={summary}
              certFilter={certFilter}
              projectId={projectId}
              version={viewingOlder ? shown.version : null}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-[10.5rem_minmax(0,1fr)_21rem]">
            <SectionNav
              body={shown.body}
              questionLabel={(id) =>
                questionById.get(id)?.label ?? questionById.get(id)?.question ?? null
              }
            />
            <SynthesisBodyView
              projectId={projectId}
              version={shown.version}
              canEdit={canEdit}
              body={shown.body}
              certFilter={certFilter}
              questionText={(id) => questionById.get(id)?.question ?? null}
              questionLabel={(id) => questionById.get(id)?.label ?? null}
              info={info}
              unsupported={unsupported}
              acceptedIds={acceptedIds}
              freshThemes={freshThemes}
              baselineVersion={baselineVersion}
              sourceTitle={(id) => titleBySource.get(id) ?? "Source"}
              evidence={evidence}
            />
            <EvidencePanel />
          </div>
        </EvidenceProvider>
      )}
    </div>
  );
}

function OriginBadge({ origin }: { origin: SynthesisOrigin }) {
  return origin === "person" ? (
    <Badge variant="accent" title="Written or edited by a person; a new run keeps it as it is">
      Pinned
    </Badge>
  ) : null;
}

const BAR_COLOR: Record<Certainty, string> = {
  established: "bg-success-border",
  contested: "bg-warning-border",
  uncertain: "bg-ink-400",
};

function SummaryStrip({
  summary,
  certFilter,
  projectId,
  version,
}: {
  summary: SynthesisSummary;
  certFilter: Certainty | null;
  projectId: string;
  version: number | null;
}) {
  const base = `${projectPath(projectId, "synthesis")}${version ? `&version=${version}` : ""}`;
  const chips = [
    { label: "All", count: summary.statements, href: base, active: certFilter === null },
    ...CERTAINTIES.map((key) => ({
      label: CERTAINTY_LABEL[key],
      count: summary.byCertainty[key],
      href: `${base}&cert=${key}`,
      active: certFilter === key,
    })),
  ];
  return (
    <div className="flex flex-col gap-3 rounded border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="min-w-48 flex-1">
          <div
            role="img"
            aria-label={`${pluralize(summary.statements, "statement")}: ${CERTAINTIES.map(
              (key) => `${summary.byCertainty[key]} ${CERTAINTY_LABEL[key].toLowerCase()}`,
            ).join(", ")}`}
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-panel-100"
          >
            {CERTAINTIES.filter((key) => summary.byCertainty[key] > 0).map((key) => (
              <div
                key={key}
                className={BAR_COLOR[key]}
                style={{ flexGrow: summary.byCertainty[key], flexBasis: 0 }}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-700">
            <b>{summary.byCertainty.established}</b> established ·{" "}
            <b>{summary.byCertainty.contested}</b> contested ·{" "}
            <b>{summary.byCertainty.uncertain}</b> uncertain
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-700">
          {(
            [
              [summary.tensions, "tension", "tensions"],
              [summary.gaps, "still open", "still open"],
              [summary.patterns, "pattern", "patterns"],
            ] as const
          ).map(([count, one, many]) => (
            <div key={many}>
              <dt className="sr-only">{many}</dt>
              <dd>
                <b className="block text-xl font-bold text-ink-900">{count}</b>
                {count === 1 ? one : many}
              </dd>
            </div>
          ))}
          {summary.unsupported > 0 && (
            <div>
              <dt className="sr-only">Lost their support</dt>
              <dd className="text-danger">
                <b className="block text-xl font-bold">{summary.unsupported}</b>
                lost {summary.unsupported === 1 ? "its" : "their"} support
              </dd>
            </div>
          )}
        </dl>
      </div>
      {summary.statements > 0 && <FilterChips label="Show statements that are" chips={chips} />}
    </div>
  );
}

function SectionNav({
  body,
  questionLabel,
}: {
  body: SynthesisBody;
  questionLabel: (id: string) => string | null;
}) {
  const entries: { href: string; label: string; count: number }[] = [
    ...body.sections.map((section) => ({
      href: `#${questionAnchor(section.questionId)}`,
      label: section.questionId
        ? (questionLabel(section.questionId) ?? "Removed question")
        : "No question",
      count: section.findings.length,
    })),
    ...(body.emerging.length > 0
      ? [{ href: `#${SECTION_ANCHORS.patterns}`, label: "Patterns", count: body.emerging.length }]
      : []),
    ...(body.tensions.length > 0
      ? [{ href: `#${SECTION_ANCHORS.tensions}`, label: "Conflicts", count: body.tensions.length }]
      : []),
    ...(body.narrative.length > 0
      ? [
          {
            href: `#${SECTION_ANCHORS.narrative}`,
            label: "Worth hearing",
            count: body.narrative.length,
          },
        ]
      : []),
  ];
  if (entries.length < 2) return <div className="hidden lg:block" />;
  return (
    <nav
      aria-label="Sections"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 lg:pb-0"
    >
      <div className="hidden px-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-ink-500 lg:block">
        Jump to
      </div>
      {entries.map((entry) => (
        <a
          key={entry.href}
          href={entry.href}
          className="flex shrink-0 items-center justify-between gap-3 rounded px-2.5 py-2 text-sm text-ink-700 hover:bg-brand-surface hover:text-brand-link"
        >
          <span className="line-clamp-2">{entry.label}</span>
          <span className="text-ink-500">{entry.count}</span>
        </a>
      ))}
    </nav>
  );
}

function SupportMeter({
  cites,
  info,
}: {
  cites: readonly string[];
  info: ReadonlyMap<string, CitedFindingInfo>;
}) {
  const breadth = supportBreadth(cites, info);
  const dots = meterDots(breadth.sources);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-1" aria-hidden="true">
        {Array.from({ length: dots.total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-2 w-2 rounded-full",
              index < dots.filled ? "bg-brand-primary" : "bg-panel-100",
            )}
          />
        ))}
      </span>
      {breadthLine(breadth)}
    </span>
  );
}

function SynthesisBodyView({
  projectId,
  version,
  canEdit,
  body,
  certFilter,
  questionText,
  questionLabel,
  info,
  unsupported,
  acceptedIds,
  freshThemes,
  baselineVersion,
  sourceTitle,
  evidence,
}: {
  projectId: string;
  version: number;
  canEdit: boolean;
  body: SynthesisBody;
  certFilter: Certainty | null;
  questionText: (id: string) => string | null;
  questionLabel: (id: string) => string | null;
  info: ReadonlyMap<string, CitedFindingInfo>;
  unsupported: ReadonlySet<string>;
  acceptedIds: ReadonlySet<string>;
  freshThemes: ReadonlySet<string>;
  baselineVersion: number | null;
  sourceTitle: (id: string) => string;
  evidence: (key: string, heading: string, cites: readonly string[]) => EvidencePayload;
}) {
  const setupHref = projectPath(projectId, "setup");
  const livePatterns = body.emerging.filter((theme) => theme.status !== "dismissed");
  const dismissedPatterns = body.emerging.filter((theme) => theme.status === "dismissed");

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {body.sections.map((section) => {
        const statements = certFilter
          ? section.findings.filter((finding) => finding.certainty === certFilter)
          : section.findings;
        if (certFilter && statements.length === 0) return null;
        return (
          <section
            key={section.questionId ?? "none"}
            id={questionAnchor(section.questionId)}
            className="flex scroll-mt-4 flex-col gap-3"
          >
            <div>
              {section.questionId && questionLabel(section.questionId) && (
                <div className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  {questionLabel(section.questionId)}
                </div>
              )}
              <h2 className="font-serif text-lg font-semibold text-ink-900">
                {section.questionId
                  ? (questionText(section.questionId) ?? "A question that was removed")
                  : "Findings that answer no question"}
              </h2>
            </div>

            <ul className="flex flex-col gap-3">
              {statements.map((statement) => {
                const breadth = supportBreadth(statement.cites, info);
                return (
                  <EvidenceCard
                    key={statement.id}
                    payload={evidence(statement.id, statement.statement, statement.cites)}
                    footer={<SupportMeter cites={statement.cites} info={info} />}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={CERTAINTY_VARIANT[statement.certainty]}>
                        {CERTAINTY_LABEL[statement.certainty]}
                      </Badge>
                      {breadth.sources === 1 && (
                        <Badge
                          variant="warning"
                          title="Everything behind this comes from one source"
                        >
                          One source&apos;s account
                        </Badge>
                      )}
                      <OriginBadge origin={statement.origin} />
                      {unsupported.has(statement.id) && (
                        <Badge variant="danger">No accepted finding behind it</Badge>
                      )}
                    </div>
                    <p className="text-[15px] leading-snug text-ink-900">{statement.statement}</p>
                  </EvidenceCard>
                );
              })}
            </ul>

            {!certFilter && section.gaps.length > 0 && (
              <div className="rounded border border-dashed border-line bg-white p-4">
                <SectionHeading level="eyebrow" as="h3" className="mb-2">
                  Still open
                </SectionHeading>
                <ul className="flex flex-col gap-2 text-sm text-ink-700">
                  {section.gaps.map((gap) => (
                    <li
                      key={gap.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                    >
                      <span className="min-w-0 flex-1 basis-64">
                        {gap.text} <OriginBadge origin={gap.origin} />
                      </span>
                      {gap.questionId ? (
                        <span className="flex items-center gap-2">
                          <Badge variant="success">Tracking</Badge>
                          <TextLink href={setupHref}>Open on Setup</TextLink>
                        </span>
                      ) : (
                        canEdit && (
                          <TrackItemButton
                            projectId={projectId}
                            expectVersion={version}
                            kind="gap"
                            itemId={gap.id}
                            text={gap.text}
                            label="Track as a question"
                            variant="ghost"
                          />
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {!certFilter && body.emerging.length > 0 && (
        <section id={SECTION_ANCHORS.patterns} className="flex scroll-mt-4 flex-col gap-3">
          <SectionHeading>Patterns across sources</SectionHeading>
          <DismissibleHint id="synthesis-patterns">
            Things several people described separately that no research question asked about. They
            are leads, not answers: open the evidence behind one, and track it as a question to have
            the next Analyze listen for it.
          </DismissibleHint>
          <ul className="flex flex-col gap-3">
            {livePatterns.map((theme) => {
              const passagesOnly = isPassagesOnly(theme, acceptedIds);
              return (
                <EvidenceCard
                  key={theme.id}
                  payload={evidence(theme.id, theme.label, theme.cites)}
                  footer={
                    theme.cites.length > 0 ? <SupportMeter cites={theme.cites} info={info} /> : null
                  }
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="accent">Emerging</Badge>
                    {freshThemes.has(theme.id) && baselineVersion !== null && (
                      <Badge variant="neutral" title={`Not in version ${baselineVersion}`}>
                        New
                      </Badge>
                    )}
                    {passagesOnly && (
                      <Badge
                        variant="warning"
                        title="Rests on passages the model found in the recordings, not on an accepted finding"
                      >
                        Passages only
                      </Badge>
                    )}
                    {theme.status === "tracking" && <Badge variant="success">Tracking</Badge>}
                    {theme.origin === "person" && theme.status === undefined && (
                      <OriginBadge origin={theme.origin} />
                    )}
                    {unsupported.has(theme.id) && (
                      <Badge variant="danger">No accepted finding behind it</Badge>
                    )}
                  </div>
                  <p className="text-sm font-bold text-ink-900">{theme.label}</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-ink-900">{theme.statement}</p>
                  {theme.passages.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      <span className="text-ink-500">In the recordings:</span>
                      {theme.passages.map((passage, index) => (
                        <Link
                          key={index}
                          href={sourcePath(passage.sourceId, {
                            projectId,
                            t: passage.startMs,
                            page: passage.page,
                          })}
                          className="text-brand-link hover:underline"
                        >
                          {sourceTitle(passage.sourceId)}
                          {passage.startMs != null ? ` at ${formatDuration(passage.startMs)}` : ""}
                        </Link>
                      ))}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3">
                    {theme.status === "tracking" ? (
                      <p className="text-sm text-ink-500">
                        Added as a research question.{" "}
                        <TextLink href={setupHref}>Open on Setup</TextLink>, then Analyze again.
                      </p>
                    ) : (
                      canEdit && (
                        <>
                          <TrackItemButton
                            projectId={projectId}
                            expectVersion={version}
                            kind="theme"
                            itemId={theme.id}
                            text={theme.label}
                            label="Track as a research question"
                          />
                          <DismissThemeButton
                            projectId={projectId}
                            expectVersion={version}
                            themeId={theme.id}
                            dismissed={false}
                          />
                        </>
                      )
                    )}
                  </div>
                </EvidenceCard>
              );
            })}
          </ul>
          {dismissedPatterns.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-500 hover:text-ink-700">
                Dismissed ({dismissedPatterns.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {dismissedPatterns.map((theme) => (
                  <li
                    key={theme.id}
                    className="flex items-center justify-between gap-3 rounded border border-line bg-white px-3 py-1.5"
                  >
                    <span className="text-ink-500">{theme.label}</span>
                    {canEdit && (
                      <DismissThemeButton
                        projectId={projectId}
                        expectVersion={version}
                        themeId={theme.id}
                        dismissed
                      />
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {!certFilter && body.tensions.length > 0 && (
        <section id={SECTION_ANCHORS.tensions} className="flex scroll-mt-4 flex-col gap-3">
          <SectionHeading>Where accounts conflict</SectionHeading>
          <ul className="flex flex-col gap-3">
            {body.tensions.map((tension) => (
              <li key={tension.id} className="rounded border border-line bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="warning">Tension</Badge>
                  <OriginBadge origin={tension.origin} />
                  {unsupported.has(tension.id) && (
                    <Badge variant="danger">No accepted finding behind it</Badge>
                  )}
                </div>
                <p className="mb-3 text-[15px] leading-snug text-ink-900">{tension.statement}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tension.sides.map((side, index) => {
                    const payload = evidence(`${tension.id}:${index}`, side.label, side.cites);
                    return (
                      <div key={index} className="rounded bg-panel-50 p-3">
                        <p className="text-sm font-semibold text-ink-900">{side.label}</p>
                        <p className="mt-1 text-sm text-ink-500">{payload.support}</p>
                        {payload.items.length > 0 && <EvidenceButton payload={payload} />}
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!certFilter && body.narrative.length > 0 && (
        <section id={SECTION_ANCHORS.narrative} className="flex scroll-mt-4 flex-col gap-3">
          <SectionHeading>Worth hearing</SectionHeading>
          <DismissibleHint id="synthesis-worth-hearing">
            Moments in the recordings a paraphrase would lose. Open one to listen; none is a
            finding.
          </DismissibleHint>
          <ul className="flex flex-col gap-3">
            {body.narrative.map((note) => (
              <NarrativeItem
                key={note.id}
                projectId={projectId}
                note={note}
                sourceTitle={sourceTitle}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NarrativeItem({
  projectId,
  note,
  sourceTitle,
}: {
  projectId: string;
  note: NarrativeNote;
  sourceTitle: (sourceId: string) => string;
}) {
  return (
    <li className="rounded border border-line bg-white p-4">
      <p className="text-[15px] leading-snug text-ink-900">
        {note.note} <OriginBadge origin={note.origin} />
      </p>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {note.passages.map((passage, index) => (
          <Link
            key={index}
            href={sourcePath(passage.sourceId, {
              projectId,
              t: passage.startMs,
              page: passage.page,
            })}
            className="text-brand-link hover:underline"
          >
            {sourceTitle(passage.sourceId)}
            {passage.startMs != null ? ` at ${formatDuration(passage.startMs)}` : ""}
          </Link>
        ))}
      </p>
    </li>
  );
}
