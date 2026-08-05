import { listPipelineSubmissions } from "@/lib/academic-partnerships/queries";
import { KanbanBoardField } from "./kanban-board-field";

export default async function AcademicPartnershipsPipelinePage() {
  const submissions = await listPipelineSubmissions();

  if (submissions.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No submissions in the pipeline yet. New inquiries from the public form will appear here.
      </div>
    );
  }

  return <KanbanBoardField submissions={submissions} />;
}
