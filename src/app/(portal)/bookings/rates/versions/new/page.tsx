import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { requireBookingsAccess } from "@/lib/bookings/access";
import { VERSION_STATUS_LABEL } from "@/lib/bookings/labels";
import { RATES_PATH } from "@/lib/bookings/paths";
import { listVersions } from "@/lib/bookings/queries";
import { createVersion } from "../../actions";
import { RatesTabs } from "../../rates-tabs";
import { TextLink } from "@/components/ui/primary-link";

export default async function NewVersionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const context = await requireBookingsAccess();
  if (!context.isFinance) redirect(RATES_PATH);
  const versions = await listVersions();
  const suggested = (() => {
    const numbers = versions
      .map((version) => /^v(\d+)\.(\d+)$/.exec(version.label))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [Number(match[1]), Number(match[2])] as const)
      .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    const latest = numbers[0];
    return latest ? `v${latest[0]}.${latest[1] + 1}` : "v0.1";
  })();

  return (
    <div className="flex flex-col gap-4">
      <RatesTabs active="assumptions" versionId={from ?? null} />
      <h3 className="text-sm font-bold text-ink-900">New rate model version</h3>
      <form action={createVersion} className="flex w-full max-w-2xl flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              name="label"
              required
              maxLength={40}
              defaultValue={suggested}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="copy_from">Start from</Label>
            <Select
              id="copy_from"
              name="copy_from"
              defaultValue={from ?? versions.find((v) => v.in_use)?.id ?? ""}
            >
              <option value="">An empty version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {VERSION_STATUS_LABEL[version.status]}
                  {version.in_use ? " · in use" : ""}
                </option>
              ))}
            </Select>
            <FieldHint>
              Copies that version&apos;s assumptions, pools and packages, with their validation as
              it stands. Nothing about the version copied from changes.
            </FieldHint>
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="What this version is for — a new budget year, validated fringe, the asset inventory…"
          />
        </div>
        <div className="flex items-center gap-4">
          <Button type="submit">Create version</Button>
          <TextLink href={RATES_PATH}>Cancel</TextLink>
        </div>
      </form>
    </div>
  );
}
