import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { RichTextField } from "@/components/ui/rich-text-field";
import { requireRoadmapAccess } from "@/lib/roadmap/access";
import { getPostDetail } from "@/lib/roadmap/queries";
import { updatePost } from "../../actions";

export default async function EditRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { profile } = await requireRoadmapAccess();

  const post = await getPostDetail(id, profile.id);
  if (!post) notFound();
  // Only the author edits the words. Kind and target are curation, and live on
  // the post's own screen behind the curator panel.
  if (post.author_id !== profile.id) redirect(`/roadmap/${id}`);

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <Link href={`/roadmap/${id}`} className="text-xs font-semibold text-brand-link">
          ← Back to the request
        </Link>
      </div>
      <div className="rounded border border-line">
        <div className="border-b border-line px-5 py-4 font-serif text-[17px] font-bold text-ink-900">
          Edit request
        </div>
        <form action={updatePost} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="post_id" value={post.id} />
          {error && <Alert>{error}</Alert>}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={160} defaultValue={post.title} />
          </div>

          <div>
            <Label htmlFor="body">Description</Label>
            <RichTextField name="body" defaultValue={post.body} ariaLabel="Request description" />
            <FieldHint>
              Editing does not reset votes or comments — people voted for the idea, not the wording.
            </FieldHint>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Link href={`/roadmap/${id}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
