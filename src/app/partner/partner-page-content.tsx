import { getPublicFormConfig } from "@/lib/academic-partnerships/public";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PublicShell } from "@/components/ui/public-shell";
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
        <PageHeader size="public" className="mb-3" title="WUWF Applied Media Partnership Program" />
        <Alert variant="note">
          WUWF is not currently accepting new partnership inquiries. Please check back later.
        </Alert>
      </PublicShell>
    );
  }

  return (
    <PublicShell embedded={embedded}>
      <PartnerForm
        introCopy={config.intro_copy}
        enabledPartnershipTypes={config.enabled_partnership_types}
      />
    </PublicShell>
  );
}
