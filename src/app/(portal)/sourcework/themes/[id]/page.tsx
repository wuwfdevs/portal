import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getThemeDetail, listThemes, listResearchQuestionsForPicker } from "@/lib/transcription/themes";
import { ThemeDetailPanel } from "./theme-detail-panel";

export default async function ThemeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireToolAccess("transcription");
  const { id } = await params;

  const [theme, allThemes, questions] = await Promise.all([
    getThemeDetail(id),
    listThemes(),
    listResearchQuestionsForPicker(),
  ]);
  if (!theme) notFound();

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <Link
        href="/sourcework?tab=themes"
        className="text-xs font-semibold text-brand-link hover:underline"
      >
        ← Back to themes
      </Link>
      <div className="mt-4 max-w-2xl">
        <ThemeDetailPanel theme={theme} allThemes={allThemes} questions={questions} />
      </div>
    </div>
  );
}
