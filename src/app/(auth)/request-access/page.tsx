import Image from "next/image";
import Link from "next/link";
import { RequestAccessForm } from "./request-access-form";

export default function RequestAccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel-50 px-6 py-12">
      <div className="w-full max-w-[400px] rounded border border-line bg-white p-9">
        <Image src="/wuwf-logo.png" alt="WUWF 88.1" height={34} width={80} className="mb-7 h-[34px] w-auto" />
        <h1 className="mb-2 font-serif text-2xl font-bold text-ink-900">Request access</h1>
        <p className="mb-6 text-sm leading-relaxed text-ink-500">
          Tell us who you are and what you need. A WUWF Tools administrator reviews every request
          before access is granted.
        </p>
        <RequestAccessForm />
        <div className="my-6 border-t border-line" />
        <p className="text-sm text-ink-500">
          Already have access?{" "}
          <Link href="/login" className="font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
