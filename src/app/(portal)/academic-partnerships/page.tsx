import { EmptyState } from "@/components/ui/empty-state";
import { listPipelineSubmissions } from "@/lib/academic-partnerships/queries";
import { KanbanBoard } from "./kanban-board";

export default async function AcademicPartnershipsPipelinePage() {
  const submissions = await listPipelineSubmissions();

  if (submissions.length === 0) {
    return (
      <EmptyState>
        No submissions in the pipeline yet. New inquiries from the public form will appear here.
      </EmptyState>
    );
  }

  return <KanbanBoard submissions={submissions} />;
}
