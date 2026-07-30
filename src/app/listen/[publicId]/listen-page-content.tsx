import { getPublicQuery } from "@/lib/audience-listening/participant";
import { isValidPublicId } from "@/lib/audience-listening/public-id";
import { publicQueryUrl } from "@/lib/audience-listening/embed";
import { getSiteUrl } from "@/lib/site-url";
import { Alert } from "@/components/ui/alert";
import { ListenShell } from "./listen-shell";
import { Participate } from "./participate";

/**
 * Both public routes render this. `/listen/[publicId]` is the standalone page;
 * `/listen/[publicId]/embed` is the same flow with the outer chrome dropped for
 * an iframe. Keeping them one component is what stops the embed quietly
 * drifting into a second, less-tested version of the real thing.
 *
 * Every unhappy state is handled here rather than in the client component,
 * because none of them can become the happy one without a page load: a draft or
 * unknown id, a query that hasn't opened yet, one that has closed, and one that
 * was opened with no questions.
 */
export async function ListenPageContent({
  publicId,
  embedded,
}: {
  publicId: string;
  embedded: boolean;
}) {
  // Rejecting a malformed id without a round trip. The answer is the same
  // "unavailable" card either way, so this leaks nothing — it just avoids
  // asking the database about a string that could never have been stored.
  const query = isValidPublicId(publicId) ? await getPublicQuery(publicId) : null;

  if (!query) {
    return (
      <ListenShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">
          This page isn&apos;t available
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-700">
          The link may be mistyped, or this question set may not have been published. Check the link
          in the story you came from.
        </p>
      </ListenShell>
    );
  }

  if (query.questions.length === 0) {
    return (
      <ListenShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">{query.public_title}</h1>
        <Alert variant="note">There are no questions here yet. Please check back shortly.</Alert>
      </ListenShell>
    );
  }

  if (query.state === "not_yet_open") {
    return (
      <ListenShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">{query.public_title}</h1>
        <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
          {query.public_intro}
        </p>
        <Alert variant="note">
          This isn&apos;t open for responses yet
          {query.opens_at
            ? ` — it opens on ${new Date(query.opens_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}.`
            : "."}
        </Alert>
      </ListenShell>
    );
  }

  if (query.state === "closed") {
    return (
      <ListenShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">{query.public_title}</h1>
        <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
          {query.public_intro}
        </p>
        <Alert variant="note">
          WUWF is no longer collecting responses to this. Thank you to everyone who took part.
        </Alert>
      </ListenShell>
    );
  }

  return (
    <Participate
      query={query}
      embedded={embedded}
      standaloneUrl={publicQueryUrl(getSiteUrl(), query.public_id)}
    />
  );
}

/** Shared metadata for both routes — the public title, never the internal one. */
export async function listenMetadata(publicId: string) {
  const query = isValidPublicId(publicId) ? await getPublicQuery(publicId).catch(() => null) : null;
  return {
    title: query ? `${query.public_title} · WUWF` : "WUWF Public Media",
    description: query?.public_intro?.slice(0, 200) || undefined,
  };
}
