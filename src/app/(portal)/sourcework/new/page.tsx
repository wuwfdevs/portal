import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { NewProjectForm } from "./new-project-form";

// completeProjectUpload (called from NewProjectForm) can kick off
// startDocumentProcessing, which schedules a Mistral OCR call via Next's
// after() for a large scanned document — raised here so that work has room
// to finish. A Server Action inherits its invoking route's maxDuration;
// this can't live in actions.ts itself (a "use server" file) — a bare
// `export const maxDuration` there broke Turbopack's Server Actions
// compilation entirely ("module has no exports at all"), confirmed while
// building this phase. See docs/sourcework-design.md §8.6 for the execution
// model and its stated risk (a hard platform-level kill below even this
// ceiling still leaves a run recoverable via isStaleProcessingRun, not
// stuck forever).
export const maxDuration = 300;

export default async function NewTranscriptionProjectPage() {
  await requireToolAccess("transcription");

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/sourcework" className="text-xs font-semibold text-brand-link">
          ← Back to projects
        </Link>
      </div>
      <div className="max-w-lg">
        <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">New project</h1>
        <p className="mb-6 text-sm text-ink-500">Upload the raw interview to get started.</p>
        <NewProjectForm />
      </div>
    </div>
  );
}
