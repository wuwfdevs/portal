import Link from "next/link";
import { requireToolAccess } from "@/lib/auth/authz";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { createSession } from "../actions";

export default async function NewRemoteInterviewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireToolAccess("remote-interview");
  const { error } = await searchParams;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="mb-5">
        <Link href="/remote-interview" className="text-xs font-semibold text-brand-link">
          ← Back to sessions
        </Link>
      </div>
      <div className="max-w-lg">
        <h1 className="mb-1.5 font-serif text-[22px] font-bold text-ink-900">New session</h1>
        <p className="mb-6 text-sm text-ink-500">
          You&apos;ll get a guest link to send as soon as this is created.
        </p>

        {error && <Alert className="mb-4">{error}</Alert>}

        <form action={createSession} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Mayor Reeves on bridge funding" required />
          </div>
          <div>
            <Label htmlFor="scheduled_at">Scheduled time</Label>
            <Input id="scheduled_at" name="scheduled_at" type="datetime-local" />
            <FieldHint>
              Optional — you can start recording whenever you&apos;re both ready regardless.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Context for this interview — where, why, who set it up"
            />
          </div>

          <Button type="submit">Create session</Button>
        </form>
      </div>
    </div>
  );
}
