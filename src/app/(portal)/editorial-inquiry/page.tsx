import { getInquiryDetail, listInquiries } from "@/lib/editorial-inquiry/queries";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { startNewInquiry } from "./actions";
import { InquiryWorkspace } from "./inquiry-workspace";

export default async function EditorialInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ inquiry?: string; error?: string }>;
}) {
  const { inquiry: inquiryParam, error } = await searchParams;
  const inquiries = await listInquiries();

  if (inquiries.length === 0) {
    return <EmptyState error={error} />;
  }

  const activeId = inquiries.some((i) => i.id === inquiryParam) ? inquiryParam! : inquiries[0]!.id;
  const detail = await getInquiryDetail(activeId);
  if (!detail) {
    return <EmptyState error={error} />;
  }

  return <InquiryWorkspace key={detail.inquiry.id} inquiries={inquiries} detail={detail} />;
}

function EmptyState({ error }: { error?: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <h1 className="font-serif text-2xl text-ink-900">Editorial Inquiry</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Start from one broad guiding question. You&apos;ll grow it outward into concrete,
          reportable story questions — exploring related angles, drilling down into specifics, and
          discussing each one with an AI collaborator.
        </p>
        {error && (
          <Alert variant="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <form action={startNewInquiry} className="mt-6 flex flex-col gap-3">
          <Textarea
            name="seed_question"
            required
            rows={3}
            placeholder="e.g. How does this region sustain service members, families, and communities amid national-defense demands?"
          />
          <Button type="submit" className="self-start">
            Start inquiry
          </Button>
        </form>
      </div>
    </div>
  );
}
