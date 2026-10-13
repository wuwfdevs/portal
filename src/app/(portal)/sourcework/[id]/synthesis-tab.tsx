import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/primary-link";
import { formatShortDateTime, pluralize } from "@/lib/format";
import { formatDuration } from "@/lib/transcription/media";
import { projectPath, sourcePath } from "@/lib/transcription/links";
import { listResearchQuestions } from "@/lib/sourcework/research-queries";
import {
  CERTAINTY_LABEL,
  supportBreadth,
  unsupportedIds,
  type CitedFindingInfo,
  type NarrativeNote,
  type SynthesisBody,
  type SynthesisOrigin,
} from "@/lib/sourcework/synthesis";
import {
  getCurrentSynthesis,
  getSynthesisVersion,
  isSynthesisRunning,
  listAcceptedFindings,
  listSynthesisVersions,
  type AcceptedFinding,
} from "@/lib/sourcework/synthesis-queries";
import {
  CERTAINTY_VARIANT,
  breadthLine,
  synthesisIntro,
  synthesizeButtonLabel,
} from "@/lib/sourcework/synthesis-view";
import { findingsChangedSince } from "@/lib/sourcework/synthesis";
import { SynthesizeButton } from "./synthesize-button";

/**
 * The Synthesis tab (docs/sourcework-analysis-design.md §21): what the project's accepted findings
 * establish for each research question, how firmly, where accounts conflict and what is still open.
 * It is a reading aid over the findings, never evidence in itself: every statement opens onto the
 * findings it rests on, and onto the passages they came from.
 */
export async function SynthesisTab({
  projectId,
  versionParam,
}: {
  projectId: string;
  versionParam?: string;
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

  const findingById = new Map(findings.map((finding) => [finding.id, finding]));
  const acceptedIds = new Set(findingById.keys());
  const changedSince =
    current === null
      ? 0
      : findingsChangedSince(
          findings.map((finding) => finding.updatedAt),
          current.createdAt,
        );
  const questionText = new Map(questions.map((question) => [question.id, question]));
  const info = new Map<string, CitedFindingInfo>(
    findings.map((finding) => [
      finding.id,
      { sourceId: finding.sourceId, speakerId: finding.speakerId },
    ]),
  );
  const unsupported = shown ? unsupportedIds(shown.body, acceptedIds) : new Set<string>();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-600">
          {synthesisIntro({
            acceptedFindings: findings.length,
            questionCount: activeQuestions.length,
            hasSynthesis: current !== null,
          })}
        </p>
        {findings.length > 0 && !viewingOlder && (
          <SynthesizeButton
            projectId={projectId}
            label={synthesizeButtonLabel(current !== null, changedSince)}
            alreadyRunning={running}
          />
        )}
        {truncated && (
          <Alert variant="warning">
            This project has more accepted findings than one synthesis can read. The oldest{" "}
            {findings.length} were used.
          </Alert>
        )}
        {current && changedSince > 0 && !viewingOlder && (
          <Alert variant="info">
            {pluralize(changedSince, "finding")} {changedSince === 1 ? "has" : "have"} changed since
            this version was written. Synthesize again to bring it up to date.
          </Alert>
        )}
      </div>

      {viewingOlder && shown && (
        <Alert
          variant="note"
          action={
            <TextLink href={projectPath(projectId, "synthesis")}>Back to the latest</TextLink>
          }
        >
          You are reading version {shown.version}, written {formatShortDateTime(shown.createdAt)}.
          It is kept for reference.
        </Alert>
      )}

      {shown === null ? (
        findings.length > 0 ? (
          <EmptyState title="No synthesis yet">
            Choose Synthesize to have the accepted findings read together.
          </EmptyState>
        ) : null
      ) : (
        <SynthesisBodyView
          projectId={projectId}
          body={shown.body}
          questionText={(id) => questionText.get(id)?.question ?? null}
          questionLabel={(id) => questionText.get(id)?.label ?? null}
          findingById={findingById}
          info={info}
          unsupported={unsupported}
        />
      )}

      {versions.length > 1 && (
        <section aria-labelledby="synthesis-history">
          <SectionHeading level="eyebrow" id="synthesis-history" className="mb-2">
            Earlier versions
          </SectionHeading>
          <ul className="flex flex-col gap-1 text-sm">
            {versions.map((version) => (
              <li key={version.version}>
                <Link
                  href={`${projectPath(projectId, "synthesis")}&version=${version.version}`}
                  className="text-brand-link hover:underline"
                >
                  Version {version.version}
                </Link>{" "}
                <span className="text-ink-500">
                  · {formatShortDateTime(version.createdAt)} ·{" "}
                  {version.savedVia === "person" ? "edited by a person" : "written by a run"}
                  {version.version === current?.version ? " · latest" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
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

function SynthesisBodyView({
  projectId,
  body,
  questionText,
  questionLabel,
  findingById,
  info,
  unsupported,
}: {
  projectId: string;
  body: SynthesisBody;
  questionText: (id: string) => string | null;
  questionLabel: (id: string) => string | null;
  findingById: ReadonlyMap<string, AcceptedFinding>;
  info: ReadonlyMap<string, CitedFindingInfo>;
  unsupported: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-8">
      {body.sections.map((section) => (
        <section key={section.questionId ?? "none"} className="flex flex-col gap-3">
          <div>
            {section.questionId && questionLabel(section.questionId) && (
              <div className="text-xs font-bold uppercase tracking-wider text-ink-400">
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
            {section.findings.map((statement) => (
              <li key={statement.id} className="rounded border border-line bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={CERTAINTY_VARIANT[statement.certainty]}>
                    {CERTAINTY_LABEL[statement.certainty]}
                  </Badge>
                  <OriginBadge origin={statement.origin} />
                  {unsupported.has(statement.id) && (
                    <Badge variant="danger">No accepted finding behind it</Badge>
                  )}
                </div>
                <p className="text-[15px] leading-snug text-ink-900">{statement.statement}</p>
                <FindingsDetails
                  projectId={projectId}
                  cites={statement.cites}
                  findingById={findingById}
                  info={info}
                />
              </li>
            ))}
          </ul>

          {section.gaps.length > 0 && (
            <div>
              <SectionHeading level="eyebrow" as="h3" className="mb-1.5">
                Still open
              </SectionHeading>
              <ul className="list-disc pl-5 text-sm text-ink-700">
                {section.gaps.map((gap) => (
                  <li key={gap.id}>
                    {gap.text} <OriginBadge origin={gap.origin} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {body.tensions.length > 0 && (
        <section className="flex flex-col gap-3">
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
                  {tension.sides.map((side, index) => (
                    <div key={index} className="rounded bg-panel-50 p-3">
                      <p className="text-sm font-semibold text-ink-900">{side.label}</p>
                      <FindingsDetails
                        projectId={projectId}
                        cites={side.cites}
                        findingById={findingById}
                        info={info}
                      />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.narrative.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>Worth hearing</SectionHeading>
          <p className="-mt-2 text-sm text-ink-500">
            Moments in the recordings a paraphrase would lose. Open one to listen; none is a
            finding.
          </p>
          <ul className="flex flex-col gap-3">
            {body.narrative.map((note) => (
              <NarrativeItem
                key={note.id}
                projectId={projectId}
                note={note}
                sourceTitle={(id) =>
                  [...findingById.values()].find((finding) => finding.sourceId === id)
                    ?.sourceTitle ?? "Source"
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FindingsDetails({
  projectId,
  cites,
  findingById,
  info,
}: {
  projectId: string;
  cites: readonly string[];
  findingById: ReadonlyMap<string, AcceptedFinding>;
  info: ReadonlyMap<string, CitedFindingInfo>;
}) {
  const present = cites.filter((id) => findingById.has(id));
  const breadth = supportBreadth(cites, info);
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-ink-500 hover:text-ink-700">
        {breadthLine(breadth)}
      </summary>
      {present.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
          {present.map((id) => {
            const finding = findingById.get(id)!;
            return (
              <li key={id}>
                <p className="text-ink-900">{finding.claim}</p>
                <p className="text-xs text-ink-500">
                  {[finding.speakerLabel, finding.sourceTitle].filter(Boolean).join(" · ")}
                  {" · "}
                  <Link
                    href={sourcePath(finding.sourceId, {
                      projectId,
                      t: finding.startMs,
                      page: finding.page,
                    })}
                    className="text-brand-link hover:underline"
                  >
                    {finding.at ? `Listen at ${finding.at}` : "Open"}
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </details>
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
