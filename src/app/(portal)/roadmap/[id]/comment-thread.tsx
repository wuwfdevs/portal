import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { RichTextField } from "@/components/ui/rich-text-field";
import type { PostComment } from "@/lib/roadmap/queries";
import { addComment, deleteComment, updateComment } from "../actions";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CommentThread({
  postId,
  comments,
  viewerId,
  isCurator,
  editingCommentId,
}: {
  postId: string;
  comments: PostComment[];
  viewerId: string;
  isCurator: boolean;
  /** From `?comment=<id>`: which comment, if any, is open for editing. */
  editingCommentId: string | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif text-[15px] font-bold text-ink-900">
        {comments.length === 0
          ? "Discussion"
          : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
      </h2>

      {comments.map((comment) => {
        const mine = comment.author_id === viewerId;
        const editing = editingCommentId === comment.id && mine;

        return (
          <article key={comment.id} className="rounded border border-line bg-white p-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-2 text-[11px] text-ink-400">
              <span className="font-semibold text-ink-700">{comment.authorName}</span>
              <span>{when(comment.created_at)}</span>
              {comment.updated_at !== comment.created_at && <span>· edited</span>}
            </div>

            {editing ? (
              <form action={updateComment} className="flex flex-col gap-3">
                <input type="hidden" name="post_id" value={postId} />
                <input type="hidden" name="comment_id" value={comment.id} />
                <RichTextField
                  name="body"
                  defaultValue={comment.body}
                  ariaLabel="Edit your comment"
                  minHeightClassName="min-h-[110px]"
                />
                <div className="flex gap-2">
                  <Button type="submit">Save comment</Button>
                  <a href={`/roadmap/${postId}`}>
                    <Button type="button" variant="secondary">
                      Cancel
                    </Button>
                  </a>
                </div>
              </form>
            ) : (
              <>
                <RichText body={comment.body} className="text-sm text-ink-700" />
                {(mine || isCurator) && (
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-2">
                    {mine && (
                      <a
                        href={`/roadmap/${postId}?comment=${comment.id}`}
                        className="text-xs font-semibold text-brand-link"
                      >
                        Edit
                      </a>
                    )}
                    <form action={deleteComment}>
                      <input type="hidden" name="post_id" value={postId} />
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <button type="submit" className="text-xs font-semibold text-danger">
                        Delete
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </article>
        );
      })}

      <form action={addComment} className="flex flex-col gap-3 rounded border border-line p-4">
        <input type="hidden" name="post_id" value={postId} />
        <RichTextField name="body" ariaLabel="Add a comment" minHeightClassName="min-h-[110px]" />
        <div className="flex justify-end">
          <Button type="submit">Post comment</Button>
        </div>
      </form>
    </section>
  );
}
