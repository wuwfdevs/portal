import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { TabNav } from "@/components/ui/tab-nav";
import {
  listAnswersForQuery,
  listQuestions,
  listSubmissions,
  getQueryById,
  getLinkedProjects,
} from "@/lib/audience-listening/queries";
import { QUERY_STATUS_BADGE } from "@/lib/audience-listening/review";
import {
  availableStatusActions,
  derivePublicAvailability,
  STATUS_ACTION_LABEL,
} from "@/lib/audience-listening/query-state";
import { publicQueryUrl } from "@/lib/audience-listening/embed";
import { getSiteUrl } from "@/lib/site-url";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setQueryStatus } from "../actions";
import { OverviewTab } from "./overview-tab";
import { QuestionsTab } from "./questions-tab";
import { SettingsTab } from "./settings-tab";
import { ShareTab } from "./share-tab";
import { SubmissionsTab } from "./submissions-tab";

const TABS = ["overview", "questions", "settings", "submissions", "share"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  questions: "Questions",
  settings: "Settings",
  submissions: "Submissions",
  share: "Share",
};

const AVAILABILITY_NOTE: Record<
  ReturnType<typeof derivePublicAvailability>,
  { message: string; variant: "info" | "note" }
> = {
  unavailable: {
    message:
      "This query is a draft. Its public link doesn't work yet — it reads as though it doesn't exist.",
    variant: "note",
  },
  not_yet_open: {
    message: "Open, but not until the opening date you set. Until then the public page says so.",
    variant: "note",
  },
  open: { message: "Live and accepting responses.", variant: "info" },
  closed: {
    message:
      "Closed. The public page explains that responses are no longer being accepted — anyone who was already recording can still finish and submit.",
    variant: "note",
  },
};

export default async function QueryWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  await requireToolAccess("audience-listening");
  const { id } = await params;
  const { tab, error } = await searchParams;

  const query = await getQueryById(id);
  if (!query) notFound();

  const activeTab: Tab = TABS.includes(tab as Tab) ? (tab as Tab) : "overview";

  const [questions, submissions, answers] = await Promise.all([
    listQuestions(id),
    listSubmissions(id),
    listAnswersForQuery(id),
  ]);

  const linkedProjects = await getLinkedProjects([
    ...new Set(answers.map((answer) => answer.transcription_project_id).filter(Boolean)),
  ] as string[]);

  const availability = derivePublicAvailability(query);
  const note = AVAILABILITY_NOTE[availability];
  const siteUrl = getSiteUrl();
  const badge = QUERY_STATUS_BADGE[query.status];

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/audience-listening" className="text-xs font-semibold text-brand-link">
          ← Back to queries
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-[26px] font-bold text-ink-900">
              {query.internal_title}
            </h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="max-w-2xl text-[15px] text-ink-500">{query.public_title}</p>
          {query.status !== "draft" && (
            <p className="mt-1.5 break-all font-mono text-xs text-ink-400">
              {publicQueryUrl(siteUrl, query.public_id)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/audience-listening/${query.id}/preview`}>
            <Button variant="secondary">Preview</Button>
          </Link>
          {availableStatusActions(query.status).map((next) => (
            <form key={next} action={setQueryStatus}>
              <input type="hidden" name="query_id" value={query.id} />
              <input type="hidden" name="status" value={next} />
              <Button type="submit" variant={next === "open" ? "primary" : "secondary"}>
                {STATUS_ACTION_LABEL[next]}
              </Button>
            </form>
          ))}
        </div>
      </div>

      {error && <Alert className="mb-4">{error}</Alert>}
      <Alert variant={note.variant} className="mb-6">
        {note.message}
      </Alert>

      <TabNav
        tabs={TABS.map((candidate) => ({
          href: `/audience-listening/${query.id}?tab=${candidate}`,
          label:
            candidate === "submissions" && submissions.length > 0
              ? `${TAB_LABEL[candidate]} (${submissions.length})`
              : TAB_LABEL[candidate],
          active: candidate === activeTab,
        }))}
      />

      {activeTab === "overview" && (
        <OverviewTab
          query={query}
          questions={questions}
          submissions={submissions}
          answers={answers}
        />
      )}
      {activeTab === "questions" && (
        <QuestionsTab query={query} questions={questions} submissionCount={submissions.length} />
      )}
      {activeTab === "settings" && (
        <SettingsTab query={query} hasSubmissions={submissions.length > 0} />
      )}
      {activeTab === "submissions" && (
        <SubmissionsTab
          query={query}
          submissions={submissions}
          answers={answers}
          linkedProjects={linkedProjects}
        />
      )}
      {activeTab === "share" && (
        <ShareTab
          publicId={query.public_id}
          publicTitle={query.public_title}
          questionCount={questions.length}
          siteUrl={siteUrl}
          isDraft={query.status === "draft"}
        />
      )}
    </div>
  );
}
