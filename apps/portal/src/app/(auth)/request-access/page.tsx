import Image from "next/image";
import Link from "next/link";
import { RequestAccessForm } from "./request-access-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getStationProfile } from "@/lib/station";
import { STATION_LOGO_SRC, isRemoteLogo, toolsTitle } from "@/lib/station-brand";

export default async function RequestAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const station = await getStationProfile();

  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-6 py-12">
      <Card className="w-full max-w-[400px] p-9">
        <Image
          src={STATION_LOGO_SRC}
          unoptimized={isRemoteLogo(STATION_LOGO_SRC)}
          alt={station.name}
          height={34}
          width={80}
          className="mb-7 h-[34px] w-auto"
        />
        <PageHeader
          size="page"
          className="mb-6"
          title="Request access"
          description={
            <>
              Tell us who you are and what you need. A {toolsTitle(station)} administrator reviews
              every request before access is granted.
            </>
          }
        />
        <RequestAccessForm initialEmail={email} />
        <div className="my-6 border-t border-line" />
        <p className="text-sm text-ink-500">
          Already have access?{" "}
          <Link href="/login" className="font-semibold">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
