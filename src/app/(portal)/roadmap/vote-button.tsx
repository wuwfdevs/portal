import { cn } from "@/lib/cn";
import { toggleVote } from "./actions";

/**
 * A plain form, not client state: the count on screen is always the count in
 * the database. `return_to` carries the filtered list URL the vote was cast
 * from so the redirect lands back where the voter was.
 */
export function VoteButton({
  postId,
  voteCount,
  votedByMe,
  returnTo,
}: {
  postId: string;
  voteCount: number;
  votedByMe: boolean;
  returnTo: string;
}) {
  return (
    <form action={toggleVote}>
      <input type="hidden" name="post_id" value={postId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="voted" value={votedByMe.toString()} />
      <button
        type="submit"
        aria-pressed={votedByMe}
        aria-label={votedByMe ? "Remove your vote" : "Vote for this request"}
        className={cn(
          "flex w-12 flex-col items-center gap-0.5 rounded border py-1.5 transition-colors",
          votedByMe
            ? "border-brand-primary bg-brand-surface text-brand-link"
            : "border-line text-ink-500 hover:border-brand-primary hover:text-brand-link",
        )}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        >
          <polyline points="6 15 12 9 18 15" />
        </svg>
        <span className="text-[13px] font-bold tabular-nums">{voteCount}</span>
      </button>
    </form>
  );
}
