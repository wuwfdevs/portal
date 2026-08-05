import { getPublicFormConfig } from "@/lib/academic-partnerships/public";
import { Alert } from "@/components/ui/alert";
import { PartnerShell } from "./partner-shell";
import { PartnerForm } from "./partner-form";

/**
 * Both public routes render this — /partner is the standalone page,
 * /partner/embed is the same content with the outer chrome dropped for an
 * iframe. Mirrors src/app/listen/[publicId]/listen-page-content.tsx: keeping
 * them one component is what stops the embed quietly drifting into a second,
 * less-tested version of the real thing.
 */
export async function PartnerPageContent({ embedded }: { embedded: boolean }) {
  const config = await getPublicFormConfig();

  if (!config) {
    return (
      <PartnerShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">
          This page isn&apos;t available
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-700">
          Something went wrong loading this form. Please try again shortly.
        </p>
      </PartnerShell>
    );
  }

  if (!config.is_open) {
    return (
      <PartnerShell embedded={embedded}>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">
          WUWF Applied Media Partnership Program
        </h1>
        <Alert variant="note">
          WUWF is not currently accepting new partnership inquiries. Please check back later.
        </Alert>
      </PartnerShell>
    );
  }

  return (
    <PartnerShell embedded={embedded}>
      <PartnerForm
        introCopy={config.intro_copy}
        enabledPartnershipTypes={config.enabled_partnership_types}
      />
    </PartnerShell>
  );
}
