import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { POST_KIND_LABEL } from "@/lib/roadmap/posts";
import type { PostSummary } from "@/lib/roadmap/queries";

/**
 * The presentational card, shared by the draggable kanban tile and its
 * keyboard-accessible "Move to…" wrapper — mirrors
 * academic-partnerships/submission-card.tsx. Compact by design: title, kind,
 * what it's about, and enough activity (votes, comments) to triage without
 * opening it.
 */
export function RoadmapCard({ post }: { post: PostSummary }) {
  const target = post.target?.name ?? post.proposedToolName;

  return (
    <Link
      href={`/roadmap/${post.id}`}
      className="block rounded border border-line bg-white p-3 text-left shadow-sm hover:border-brand-primary"
    >
      <p className="text-[13px] font-bold text-ink-900">{post.title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{POST_KIND_LABEL[post.kind]}</Badge>
        {target && (
          <Badge variant={post.target?.proposed ? "muted" : "accent"}>
            {target}
            {post.target?.proposed && " (proposed)"}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
        <span>{post.authorName}</span>
        <span>
          {post.voteCount} vote{post.voteCount === 1 ? "" : "s"} · {post.commentCount} comment
          {post.commentCount === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
