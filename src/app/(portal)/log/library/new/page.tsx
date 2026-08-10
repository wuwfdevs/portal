import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { listPrograms } from "@/lib/log/queries";
import { createContentItem } from "../../library-actions";
import { ContentItemForm } from "../content-item-form";

export default async function NewContentItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const programs = await listPrograms();

  return (
    <div className="max-w-2xl">
      <Link href="/log/library" className="text-xs font-semibold text-brand-link">
        ← Back to library
      </Link>
      <h2 className="mt-2 mb-4 font-serif text-xl font-bold text-ink-900">New content item</h2>

      {error && <Alert className="mb-4">{error}</Alert>}

      <ContentItemForm action={createContentItem} programs={programs} submitLabel="Create content item" />
    </div>
  );
}
