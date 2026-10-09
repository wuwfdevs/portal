import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { POST_KIND_LABEL, POST_STATUS_BADGE } from "@/lib/roadmap/posts";
import type { PostSummary } from "@/lib/roadmap/queries";
import { VoteButton } from "./vote-button";
import { pluralize } from "@/lib/format";

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 179)}…` : flat;
}

export function PostRow({ post, returnTo }: { post: PostSummary; returnTo: string }) {
  const target = post.target?.name ?? post.proposedToolName;

  return (
    <Card className="flex items-start gap-4 p-4">
      <VoteButton
        postId={post.id}
        voteCount={post.voteCount}
        votedByMe={post.votedByMe}
        returnTo={returnTo}
      />
      <div className="min-w-0 flex-1">
        <Link
          href={`/roadmap/${post.id}`}
          className="font-serif text-[15px] font-bold text-ink-900 hover:text-brand-link"
        >
          {post.title}
        </Link>
        {post.body_text && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{excerpt(post.body_text)}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-ink-400">
          <StatusBadge map={POST_STATUS_BADGE} value={post.status} />
          <span>{POST_KIND_LABEL[post.kind]}</span>
          {target && (
            <>
              <span aria-hidden>·</span>
              <span className={post.target?.proposed ? "italic" : undefined}>
                {target}
                {post.target?.proposed && " (proposed)"}
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{post.authorName}</span>
          <span aria-hidden>·</span>
          <span>{pluralize(post.commentCount, "comment")}</span>
        </div>
      </div>
    </Card>
  );
}
