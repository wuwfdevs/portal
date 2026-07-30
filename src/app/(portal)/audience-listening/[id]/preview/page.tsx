import Link from "next/link";
import { notFound } from "next/navigation";
import { requireToolAccess } from "@/lib/auth/authz";
import { getQueryById, listQuestions } from "@/lib/audience-listening/queries";
import { publicQueryUrl } from "@/lib/audience-listening/embed";
import { getSiteUrl } from "@/lib/site-url";
import { Participate } from "@/app/listen/[publicId]/participate";
import type { PublicQueryPayload } from "@/lib/database.types";

/**
 * The public experience, rendered for staff, from the staff-visible rows.
 *
 * Deliberately not "open /listen/<public id> and look": that only works once a
 * query is open, and the moment a reporter most needs to see the flow is while
 * it is still a draft. This builds the same PublicQueryPayload the public route
 * receives from al_public_query() — the *shape* is duplicated here, not the
 * flow, which is the same component either way.
 *
 * `previewMode` disables Begin and Submit, so nothing on this page can create a
 * submission or upload audio.
 */
export default async function QueryPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireToolAccess("audience-listening");
  const { id } = await params;

  const query = await getQueryById(id);
  if (!query) notFound();
  const questions = await listQuestions(id);

  const payload: PublicQueryPayload = {
    public_id: query.public_id,
    public_title: query.public_title,
    public_intro: query.public_intro,
    // Always "open" here: previewing a draft is the point, and nothing can be
    // written anyway.
    state: "open",
    opens_at: query.opens_at,
    closes_at: query.closes_at,
    consent_text: query.consent_text,
    ask_contact_permission: query.ask_contact_permission,
    ask_attribution_permission: query.ask_attribution_permission,
    allow_anonymous_request: query.allow_anonymous_request,
    fields: {
      name: query.field_name,
      email: query.field_email,
      phone: query.field_phone,
      city: query.field_city,
      note: query.field_note,
    },
    questions: questions.map((question) => ({
      id: question.id,
      position: question.position,
      prompt: question.prompt,
      guidance: question.guidance,
      required: question.required,
      max_duration_seconds: question.max_duration_seconds,
    })),
  };

  return (
    <div>
      <div className="border-b border-line px-6 py-3 sm:px-10">
        <Link
          href={`/audience-listening/${query.id}`}
          className="text-xs font-semibold text-brand-link"
        >
          ← Back to {query.internal_title}
        </Link>
      </div>
      {questions.length === 0 ? (
        <div className="px-6 py-10 sm:px-10">
          <p className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            Nothing to preview yet — add a question first.
          </p>
        </div>
      ) : (
        <Participate
          query={payload}
          embedded={false}
          standaloneUrl={publicQueryUrl(getSiteUrl(), query.public_id)}
          previewMode
        />
      )}
    </div>
  );
}
