import "server-only";
import {
  type ListeningAuthoringQuery,
  type ListeningAuthoringStatus,
  type ListeningAuthoringSummary,
} from "@wuwf/portal-contracts";
import { generatePublicId } from "@/lib/audience-listening/public-id";
import { parseAuthoringRequest, planQuestionChanges, statusChangeProblem, type AuthoringCall } from "@/lib/audience-listening/authoring";
import { DatabaseFailure, Refusal, check, receiveStaffAction, type Supabase } from "@/lib/staff-actions/receive";
import type { ListeningAuthoringAction } from "@wuwf/portal-contracts";
import type { Database } from "@/lib/database.types";

/**
 * The listening feature of the site's signed STAFF ACTIONS channel: staff write a listening query and open or close it from the CMS's block
 * editor (packages/portal-contracts, listening-authoring.ts). It is the Portal's own rules reached from another door, not a second set of rules.
 * The channel's checks (the secret and signature, the actor's Audience Listening grant, no body logged) are lib/staff-actions/receive.ts; what is
 * here is what this feature does once they pass, writing `al_queries` and `al_questions` with the admin client, and an audit event naming the
 * actor for every change.
 */

const TOOL_KEY = "audience-listening";

type QueryRow = Database["public"]["Tables"]["al_queries"]["Row"];
type QuestionRow = Database["public"]["Tables"]["al_questions"]["Row"];

export function handleAuthoringRequest(request: Request, action: ListeningAuthoringAction): Promise<Response> {
  return receiveStaffAction<AuthoringCall>(request, {
    label: `listening/${action}`,
    toolKey: TOOL_KEY,
    parse: (json) => parseAuthoringRequest(action, json),
    run,
  });
}

async function run(supabase: Supabase, call: AuthoringCall): Promise<Record<string, unknown>> {
  switch (call.action) {
    case "list":
      return { queries: await list(supabase) };
    case "get":
      return { query: await load(supabase, call.publicId) };
    case "save":
      return save(supabase, call);
    case "set-status":
      return { query: await setStatus(supabase, call.actor, call.publicId, call.status) };
  }
}

async function list(supabase: Supabase): Promise<ListeningAuthoringSummary[]> {
  const queries = check(await supabase.from("al_queries").select("id, public_id, internal_title, public_title, status, updated_at").order("updated_at", { ascending: false }).limit(200), "listing queries") ?? [];
  const questions = check(await supabase.from("al_questions").select("query_id"), "counting questions") ?? [];
  const counts = new Map<string, number>();
  for (const row of questions) counts.set(row.query_id, (counts.get(row.query_id) ?? 0) + 1);
  return queries.map((row) => ({
    publicId: row.public_id,
    internalTitle: row.internal_title,
    publicTitle: row.public_title,
    status: row.status,
    questionCount: counts.get(row.id) ?? 0,
    updatedAt: row.updated_at,
  }));
}

async function findRow(supabase: Supabase, publicId: string): Promise<QueryRow> {
  const row = check(await supabase.from("al_queries").select("*").eq("public_id", publicId).maybeSingle(), "reading the query");
  if (!row) throw new Refusal("not_found", "That question could not be found.");
  return row;
}

async function submissionCount(supabase: Supabase, queryId: string): Promise<number> {
  const { count, error } = await supabase.from("al_submissions").select("id", { count: "exact", head: true }).eq("query_id", queryId);
  if (error) {
    console.error(`Listening authoring: counting submissions failed (${error.code ?? "no code"})`);
    throw new DatabaseFailure("counting submissions");
  }
  return count ?? 0;
}

async function questionRows(supabase: Supabase, queryId: string): Promise<QuestionRow[]> {
  return check(await supabase.from("al_questions").select("*").eq("query_id", queryId).order("position", { ascending: true }), "reading the questions") ?? [];
}

function shape(row: QueryRow, questions: QuestionRow[], submissions: number): ListeningAuthoringQuery {
  return {
    publicId: row.public_id,
    status: row.status,
    internalTitle: row.internal_title,
    publicTitle: row.public_title,
    publicIntro: row.public_intro,
    internalNotes: row.internal_notes,
    askedBy: row.asked_by,
    fromLabel: row.from_label,
    contextLabel: row.context_label,
    allowTextAnswers: row.allow_text_answers,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    submissionCount: submissions,
    updatedAt: row.updated_at,
    questions: questions.map((q) => ({ id: q.id, position: q.position, prompt: q.prompt, guidance: q.guidance, required: q.required, maxDurationSeconds: q.max_duration_seconds })),
  };
}

async function load(supabase: Supabase, publicId: string): Promise<ListeningAuthoringQuery> {
  const row = await findRow(supabase, publicId);
  const [questions, submissions] = await Promise.all([questionRows(supabase, row.id), submissionCount(supabase, row.id)]);
  return shape(row, questions, submissions);
}

async function audit(supabase: Supabase, actor: string, action: string, targetId: string, metadata?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("audit_events").insert({ actor_id: actor, action, target_type: "al_query", target_id: targetId, metadata: { ...metadata, via: "site" } });
  // The change is made; a missing audit row is logged loudly rather than undoing it.
  if (error) console.error(`Listening authoring: the audit event ${action} was not written (${error.code ?? "no code"})`);
}

async function save(supabase: Supabase, call: Extract<AuthoringCall, { action: "save" }>): Promise<Record<string, unknown>> {
  const { query: input, questions: desired } = call;
  const fields = {
    internal_title: input.internalTitle,
    public_title: input.publicTitle,
    public_intro: input.publicIntro,
    internal_notes: input.internalNotes,
    asked_by: input.askedBy,
    from_label: input.fromLabel,
    context_label: input.contextLabel,
    allow_text_answers: input.allowTextAnswers,
    opens_at: input.opensAt,
    closes_at: input.closesAt,
  };

  let row: QueryRow;
  let created = false;
  let held: QuestionRow[] = [];
  let submissions = 0;

  if (call.publicId) {
    row = await findRow(supabase, call.publicId);
    [held, submissions] = await Promise.all([questionRows(supabase, row.id), submissionCount(supabase, row.id)]);
    // Plan before writing anything, so a refused save changes nothing.
    const planned = planQuestionChanges(held, desired, submissions > 0);
    if (!planned.ok) throw new Refusal(planned.error, planned.message);
    const updated = check(await supabase.from("al_queries").update(fields).eq("id", row.id).select("*").single(), "saving the query");
    if (!updated) throw new DatabaseFailure("saving the query");
    row = updated;
    await writeQuestions(supabase, row.id, planned.plan);
    await audit(supabase, call.actor, "al.query.settings_updated", row.id);
  } else {
    const planned = planQuestionChanges([], desired, false);
    if (!planned.ok) throw new Refusal(planned.error, planned.message);
    const inserted = check(await supabase.from("al_queries").insert({ ...fields, public_id: generatePublicId(), created_by: call.actor }).select("*").single(), "creating the query");
    if (!inserted) throw new DatabaseFailure("creating the query");
    row = inserted;
    created = true;
    await writeQuestions(supabase, row.id, planned.plan);
    await audit(supabase, call.actor, "al.query.created", row.id, { internal_title: input.internalTitle });
  }

  const questions = await questionRows(supabase, row.id);
  return { query: shape(row, questions, submissions), created };
}

async function writeQuestions(supabase: Supabase, queryId: string, plan: ReturnType<typeof planQuestionChanges> extends infer R ? (R extends { ok: true; plan: infer P } ? P : never) : never): Promise<void> {
  // Removals first, so the five-question ceiling (a database trigger) sees the room they leave.
  for (const id of plan.remove) check(await supabase.from("al_questions").delete().eq("id", id).eq("query_id", queryId).select("id"), "removing a question");
  for (const { id, position, input } of plan.update) {
    check(
      await supabase
        .from("al_questions")
        .update({ position, prompt: input.prompt, guidance: input.guidance, required: input.required, max_duration_seconds: input.maxDurationSeconds })
        .eq("id", id)
        .eq("query_id", queryId)
        .select("id"),
      "saving a question",
    );
  }
  for (const { position, input } of plan.add) {
    const { error } = await supabase.from("al_questions").insert({ query_id: queryId, position, prompt: input.prompt, guidance: input.guidance, required: input.required, max_duration_seconds: input.maxDurationSeconds });
    if (error) {
      if (error.code === "23514") throw new Refusal("invalid", error.message); // the trigger's own sentence: "A query can have at most 5 questions."
      console.error(`Listening authoring: adding a question failed (${error.code ?? "no code"})`);
      throw new DatabaseFailure("adding a question");
    }
  }
}

async function setStatus(supabase: Supabase, actor: string, publicId: string, status: ListeningAuthoringStatus): Promise<ListeningAuthoringQuery> {
  const row = await findRow(supabase, publicId);
  const questions = await questionRows(supabase, row.id);
  const refusal = statusChangeProblem(status, questions.length);
  if (refusal) throw new Refusal("invalid", refusal);
  const updated = check(await supabase.from("al_queries").update({ status }).eq("id", row.id).select("*").single(), "changing the status");
  if (!updated) throw new DatabaseFailure("changing the status");
  await audit(supabase, actor, `al.query.${status}`, row.id);
  return shape(updated, questions, await submissionCount(supabase, row.id));
}
