import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listCopy } from "@/lib/underwriting/queries";
import { createCopy } from "../copy-actions";
import type { UwCopyApprovalStatus } from "@/lib/database.types";

const APPROVAL_VARIANT: Record<UwCopyApprovalStatus, BadgeVariant> = {
  draft: "neutral",
  approved: "success",
  expired: "muted",
  retired: "muted",
};

export default async function CopyLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const copy = await listCopy();

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {copy.length === 0 ? (
          <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
            No copy yet.
          </div>
        ) : (
          <TableFrame>
            <Table>
              <thead>
                <HeaderRow>
                  <Th>Cart #</Th>
                  <Th>Script</Th>
                  <Th>Duration</Th>
                  <Th>Approval</Th>
                  <Th>Production</Th>
                </HeaderRow>
              </thead>
              <tbody>
                {copy.map((item) => (
                  <Row key={item.id}>
                    <Cell className="font-semibold text-ink-900">
                      <Link href={`/underwriting/copy/${item.id}`} className="text-brand-link">
                        {item.cart_identifier ?? "(no cart #)"}
                      </Link>
                    </Cell>
                    <Cell className="max-w-xs truncate text-ink-500">{item.script ?? "—"}</Cell>
                    <Cell className="whitespace-nowrap text-ink-500">
                      {item.duration_seconds ? `${item.duration_seconds}s` : "—"}
                    </Cell>
                    <Cell>
                      <Badge variant={APPROVAL_VARIANT[item.approval_status]}>{item.approval_status}</Badge>
                    </Cell>
                    <Cell className="text-ink-500">{item.production_status}</Cell>
                  </Row>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        )}
      </div>

      <div className="w-full shrink-0 rounded border border-line lg:w-96">
        <div className="border-b border-line px-5 py-3.5 text-sm font-bold text-ink-900">New copy</div>
        <form action={createCopy} className="flex flex-col gap-4 p-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="cart_identifier">Cart #</Label>
            <Input id="cart_identifier" name="cart_identifier" maxLength={120} />
          </div>
          <div>
            <Label htmlFor="script">Script</Label>
            <Textarea id="script" name="script" rows={5} />
          </div>
          <div className="flex gap-3">
            <div>
              <Label htmlFor="effective_from">Effective from</Label>
              <Input id="effective_from" name="effective_from" type="date" />
            </div>
            <div>
              <Label htmlFor="effective_to">Effective to</Label>
              <Input id="effective_to" name="effective_to" type="date" />
            </div>
          </div>
          <FieldHint>Audio, duration, and approval/production status are set from the copy&apos;s own page.</FieldHint>
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit">Create copy</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
