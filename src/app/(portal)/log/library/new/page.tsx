import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { createContentItem } from "../../library-actions";
import { ContentItemForm } from "../content-item-form";

export default async function NewContentItemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader
        as="h2"
        back={{ href: "/log/library", label: "Back to library" }}
        title="New content item"
        className="mb-4"
      />

      {error && <Alert className="mb-4">{error}</Alert>}

      <ContentItemForm action={createContentItem} submitLabel="Create content item" />
    </div>
  );
}
