import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getProjectById } from "@/lib/transcription/projects";
import { listResearchQuestions, listDataPoints } from "@/lib/transcription/research";
import { ResearchQuestionsPanel } from "../research-questions-panel";
import { DataPointsPanel } from "../data-points-panel";

// A separate route, not a tab inside /sourcework/[id] — that page is
// source-centric (pill row, one active source's workspace); research
// questions and data points are project-wide, with no single active source
// to sit alongside. See docs/sourcework-design.md §9.5.
export default async function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireToolAccess("transcription");
  const { id } = await params;

  const project = await getProjectById(id);
  if (!project) notFound();

  const [questions, dataPoints] = await Promise.all([
    listResearchQuestions(id),
    listDataPoints(id),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-6">
        <Link
          href={`/sourcework/${id}`}
          className="text-xs font-semibold text-brand-link hover:underline"
        >
          ← Back to workspace
        </Link>
        <h1 className="mt-1.5 font-serif text-[22px] font-bold text-ink-900">
          Research — {project.title}
        </h1>
        <p className="text-sm text-ink-500">
          What you&rsquo;re trying to find out, and the findings grounding it.
        </p>
      </div>

      <div className="flex max-w-2xl flex-col gap-10">
        <ResearchQuestionsPanel projectId={id} questions={questions} />
        <DataPointsPanel projectId={id} questions={questions} dataPoints={dataPoints} />
      </div>
    </div>
  );
}
