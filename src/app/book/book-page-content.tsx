import { getPublicFormConfig } from "@/lib/bookings/public";
import { Alert } from "@/components/ui/alert";
import { BookShell } from "./book-shell";
import { BookForm } from "./book-form";

export const BOOK_PAGE_TITLE = "Request production work from WUWF";

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
      <BookShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">
          This page isn&apos;t available
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-700">
          Something went wrong loading this form. Please try again shortly.
        </p>
      </BookShell>
    );
  }

  if (!config.is_open) {
    return (
      <BookShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">{BOOK_PAGE_TITLE}</h1>
        <Alert variant="note">{config.closed_copy}</Alert>
      </BookShell>
    );
  }

  return (
    <BookShell embedded={embedded}>
      <BookForm introCopy={config.intro_copy} offeredPackages={config.offered_packages} />
    </BookShell>
  );
}
