import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { NewProjectForm } from "./new-project-form";

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
