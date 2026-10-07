import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SecondaryLink } from "@/components/ui/primary-link";
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
      <PageHeader
        className="mb-5"
        back={{ href: `/roadmap/${id}`, label: "Back to the request" }}
        title="Edit request"
      />
      <Card>
        <form action={updatePost} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="post_id" value={post.id} />
          {error && <Alert>{error}</Alert>}

          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required maxLength={160} defaultValue={post.title} />
          </Field>

          <Field
            label="Description"
            htmlFor="body"
            hint="Editing does not reset votes or comments — people voted for the idea, not the wording."
          >
            <RichTextField name="body" defaultValue={post.body} ariaLabel="Request description" />
          </Field>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <SecondaryLink href={`/roadmap/${id}`}>Cancel</SecondaryLink>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
