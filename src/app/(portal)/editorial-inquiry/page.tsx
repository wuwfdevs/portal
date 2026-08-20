import { requireToolAccess, hasToolAccess } from "@/lib/auth/authz";
import { getToolByKey } from "@/lib/tools";
import { getInquiryDetail, listInquiries } from "@/lib/editorial-inquiry/queries";
import { listGuidingQuestionOptions } from "@/lib/editorial-inquiry/editorial-planning";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startNewInquiry } from "./actions";
import { InquiryWorkspace } from "./inquiry-workspace";

export default async function EditorialInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ inquiry?: string; error?: string }>;
}) {
  const { profile } = await requireToolAccess("editorial-inquiry");
  const { inquiry: inquiryParam, error } = await searchParams;

  const [inquiries, guidingQuestionOptions, editorialPlanningTool] = await Promise.all([
    listInquiries(),
    listGuidingQuestionOptions(),
    getToolByKey("editorial-planning"),
  ]);
  const canDevelopIntoPitch = editorialPlanningTool
    ? await hasToolAccess(profile.id, editorialPlanningTool.id)
    : false;

  if (inquiries.length === 0) {
    return <EmptyState guidingQuestionOptions={guidingQuestionOptions} error={error} />;
  }

  const activeId = inquiries.some((i) => i.id === inquiryParam) ? inquiryParam! : inquiries[0]!.id;
  const detail = await getInquiryDetail(activeId);
  if (!detail) {
    return <EmptyState guidingQuestionOptions={guidingQuestionOptions} error={error} />;
  }

  return (
    <InquiryWorkspace
      key={detail.inquiry.id}
      inquiries={inquiries}
      detail={detail}
      guidingQuestionOptions={guidingQuestionOptions}
      canDevelopIntoPitch={canDevelopIntoPitch}
    />
  );
}

function EmptyState({
  guidingQuestionOptions,
  error,
}: {
  guidingQuestionOptions: Awaited<ReturnType<typeof listGuidingQuestionOptions>>;
  error?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <h1 className="font-serif text-2xl text-ink-900">Editorial Inquiry</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Start from one of WUWF&apos;s own guiding questions. Bring something you&apos;ve
          encountered — an observation, a document, a hunch, something sources keep saying — or ask
          the model to look for what&apos;s currently developing, and work out together what&apos;s
          actually known, what isn&apos;t, and what would make a strong, properly scoped story
          question.
        </p>
        {error && (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        )}
        {guidingQuestionOptions.length === 0 ? (
          <p className="mt-6 text-sm text-ink-400">
            No WUWF coverage pillars have a guiding question set yet — add one in Editorial Planning
            first.
          </p>
        ) : (
          <form action={startNewInquiry} className="mt-6 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {guidingQuestionOptions.map((option, index) => (
                <label
                  key={option.pillarId}
                  className="flex cursor-pointer items-start gap-2.5 rounded border border-line p-3 hover:bg-panel-50"
                >
                  <input
                    type="radio"
                    name="pillar_id"
                    value={option.pillarId}
                    required
                    defaultChecked={index === 0}
                    className="mt-1"
                  />
                  <span className="text-sm leading-snug text-ink-900">
                    <span className="mb-0.5 block text-[11px] font-bold tracking-wide text-brand-link uppercase">
                      {option.name}
                    </span>
                    {option.guidingQuestion}
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit" className="self-start">
              Start inquiry
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
