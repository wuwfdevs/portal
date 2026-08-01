import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/ui/rich-text";
import { requireRoadmapAccess } from "@/lib/roadmap/access";
import { getPostDetail, listTargetTools } from "@/lib/roadmap/queries";
import { POST_KIND_LABEL, POST_STATUS_BADGE } from "@/lib/roadmap/posts";
import { deletePost } from "../actions";
import { VoteButton } from "../vote-button";
import { CommentThread } from "./comment-thread";
import { CurationPanel } from "./curation-panel";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function RoadmapPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; comment?: string }>;
}) {
  const { id } = await params;
  const { error, comment } = await searchParams;
  const { profile, isCurator, isAdministrator } = await requireRoadmapAccess();

  const post = await getPostDetail(id, profile.id);
  if (!post) notFound();

  const tools = isCurator ? await listTargetTools() : [];
  const badge = POST_STATUS_BADGE[post.status];
  const mine = post.author_id === profile.id;
  const target = post.target?.name ?? post.proposedToolName;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <Link href="/roadmap" className="text-xs font-semibold text-brand-link">
          ← Back to the roadmap
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}

      <article className="flex items-start gap-4 rounded border border-line bg-white p-5">
        <VoteButton
          postId={post.id}
          voteCount={post.voteCount}
          votedByMe={post.votedByMe}
          returnTo={`/roadmap/${post.id}`}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[22px] font-bold leading-snug text-ink-900">
            {post.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-ink-400">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span>{POST_KIND_LABEL[post.kind]}</span>
            {target && (
              <>
                <span aria-hidden>·</span>
                <span className={post.target?.proposed ? "italic" : undefined}>
                  {target}
                  {post.target?.proposed && " (proposed)"}
                  {!post.target && " — not a registry entry yet"}
                </span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>
              {post.authorName}, {when(post.created_at)}
            </span>
          </div>

          <RichText
            body={post.body}
            className="mt-4 text-sm text-ink-700"
            fallback={
              <p className="mt-4 text-sm italic text-ink-400">
                This description could not be read back. Its author can retype it.
              </p>
            }
          />

          {post.status === "declined" && post.status_note && (
            <Alert variant="note" className="mt-4">
              <span className="font-semibold text-ink-700">Declined</span>
              {post.statusChangedByName && ` by ${post.statusChangedByName}`}
              {post.status_changed_at && ` on ${when(post.status_changed_at)}`}: {post.status_note}
            </Alert>
          )}

          {mine && (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3">
              <Link
                href={`/roadmap/${post.id}/edit`}
                className="text-xs font-semibold text-brand-link"
              >
                Edit
              </Link>
              <form action={deletePost}>
                <input type="hidden" name="post_id" value={post.id} />
                <button type="submit" className="text-xs font-semibold text-danger">
                  Delete
                </button>
              </form>
            </div>
          )}
        </div>
      </article>

      {isCurator && <CurationPanel post={post} tools={tools} isAdministrator={isAdministrator} />}

      <CommentThread
        postId={post.id}
        comments={post.comments}
        viewerId={profile.id}
        isCurator={isCurator}
        editingCommentId={comment ?? null}
      />
    </div>
  );
}
