import { redirect } from "next/navigation";

/** A program's details are edited in place on its own page now; this keeps an old link working. */
export default async function EditProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/log/programs/${id}?edit=1`);
}
