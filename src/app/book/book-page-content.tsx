import { getPublicFormConfig } from "@/lib/bookings/public";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PublicShell } from "@/components/ui/public-shell";
import { BookForm } from "./book-form";
import { BOOK_PAGE_TITLE } from "./title";

/**
 * Both public routes render this — /book is the standalone page, /book/embed
 * the same content with the chrome dropped for an iframe. One component, so
 * the embed can't drift into a second, less-tested version of the form
 * (the src/app/partner/partner-page-content.tsx shape).
 */
export async function BookPageContent({ embedded }: { embedded: boolean }) {
  const config = await getPublicFormConfig();

  if (!config) {
    return (
      <PublicShell embedded={embedded}>
        <PageHeader size="public" className="mb-3" title="This page isn't available" />
        <p className="text-[15px] leading-relaxed text-ink-700">
          Something went wrong loading this form. Please try again shortly.
        </p>
      </PublicShell>
    );
  }

  if (!config.is_open) {
    return (
      <PublicShell embedded={embedded}>
        <PageHeader size="public" className="mb-3" title={BOOK_PAGE_TITLE} />
        <Alert variant="note">{config.closed_copy}</Alert>
      </PublicShell>
    );
  }

  return (
    <PublicShell embedded={embedded}>
      <BookForm introCopy={config.intro_copy} offeredPackages={config.offered_packages} />
    </PublicShell>
  );
}
