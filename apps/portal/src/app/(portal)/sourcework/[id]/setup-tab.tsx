import { listContextNotes, listResearchQuestions } from "@/lib/sourcework/research-queries";
import { SetupResearch } from "./setup-research";

/**
 * The Setup tab: the project's research questions and the web background
 * gathered for them (docs/sourcework-analysis-design.md §7.1). Where the
 * project stands is the overview strip on the Sources tab, not repeated here.
 */
export async function SetupTab({ projectId }: { projectId: string }) {
  const [questions, notes] = await Promise.all([
    listResearchQuestions(projectId),
    listContextNotes(projectId),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <SetupResearch projectId={projectId} questions={questions} notes={notes} />
    </div>
  );
}
