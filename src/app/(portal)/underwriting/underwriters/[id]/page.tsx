import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { getUnderwriterDetail } from "@/lib/underwriting/queries";
import { updateUnderwriter } from "../../contract-actions";
import type { UwContractStatus } from "@/lib/database.types";

const STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

export default async function UnderwriterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const underwriter = await getUnderwriterDetail(id);
  if (!underwriter) notFound();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <Link href="/underwriting/underwriters" className="text-xs font-semibold text-brand-link">
          ← Back to underwriters
        </Link>
        <h2 className="mt-2 mb-4 font-serif text-xl font-bold text-ink-900">{underwriter.name}</h2>

        {error && <Alert className="mb-4">{error}</Alert>}

        <div className="rounded border border-line">
          <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Contracts</div>
          {underwriter.contracts.length === 0 ? (
            <p className="px-5 py-4 text-sm text-ink-500">No contracts yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {underwriter.contracts.map((contract) => (
                <li key={contract.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/underwriting/contracts/${contract.id}`} className="font-semibold text-brand-link">
                    {contract.contract_identifier}
                  </Link>
                  <Badge variant={STATUS_VARIANT[contract.status]}>{contract.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">Details</div>
        <form action={updateUnderwriter} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="underwriter_id" value={underwriter.id} />
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={underwriter.name} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="mailing_address">Mailing address</Label>
            <Textarea id="mailing_address" name="mailing_address" rows={2} defaultValue={underwriter.mailing_address ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_name">Contact name</Label>
              <Input id="contact_name" name="contact_name" defaultValue={underwriter.contact_name ?? ""} maxLength={200} />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" defaultValue={underwriter.phone ?? ""} maxLength={40} />
            </div>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={underwriter.email ?? ""} />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" name="category" defaultValue={underwriter.category ?? ""} />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={underwriter.notes ?? ""} />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </div>
    </div>
  );
}
