import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/input";
import { ReorderButtons } from "@/components/editorial/reorder-buttons";
import {
  DEFAULT_MAX_DURATION_SECONDS,
  MAX_MAX_DURATION_SECONDS,
  MIN_MAX_DURATION_SECONDS,
} from "@/lib/audience-listening/media";
import { deriveQuestionEditability, MAX_QUESTIONS } from "@/lib/audience-listening/query-state";
import type { AlQuery, AlQuestion } from "@/lib/audience-listening/queries";
import {
  addQuestion,
  deleteQuestion,
  duplicateQuestion,
  moveQuestion,
  updateQuestion,
} from "../actions";

/**
 * Add, edit, reorder, duplicate, remove — each question its own inline form,
 * the same shape the Editorial Planning settings screens use for form fields
 * and rubric criteria.
 *
 * The rule that shapes this screen: once submissions exist, wording stays
 * editable but removal and reordering stop, because every existing answer
 * carries the position and wording it was given. The notice says so rather
 * than the buttons quietly disappearing.
 */
export function QuestionsTab({
  query,
  questions,
  submissionCount,
}: {
  query: AlQuery;
  questions: AlQuestion[];
  submissionCount: number;
}) {
  const editability = deriveQuestionEditability({
    questionCount: questions.length,
    submissionCount,
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {editability.notice && <Alert variant="note">{editability.notice}</Alert>}

      {questions.map((question, index) => (
        <Card key={question.id} className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <SectionHeading>Question {question.position}</SectionHeading>
              <Badge variant={question.required ? "accent" : "muted"}>
                {question.required ? "Required" : "Optional"}
              </Badge>
            </div>
            {editability.canReorder && (
              <ReorderButtons
                action={moveQuestion.bind(null, query.id)}
                idName="question_id"
                id={question.id}
                label={`question ${question.position}`}
                isFirst={index === 0}
                isLast={index === questions.length - 1}
              />
            )}
          </div>

          <form action={updateQuestion} className="flex flex-col gap-4">
            <input type="hidden" name="query_id" value={query.id} />
            <input type="hidden" name="question_id" value={question.id} />
            <QuestionFields
              idPrefix={question.id}
              defaults={{
                prompt: question.prompt,
                guidance: question.guidance ?? "",
                internalContext: question.internal_context ?? "",
                required: question.required,
                maxDurationSeconds: question.max_duration_seconds,
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Save question</Button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {editability.canAdd && (
              <form action={duplicateQuestion}>
                <input type="hidden" name="query_id" value={query.id} />
                <input type="hidden" name="question_id" value={question.id} />
                <Button type="submit" variant="ghost">
                  Duplicate
                </Button>
              </form>
            )}
            {editability.canRemove && (
              <form action={deleteQuestion}>
                <input type="hidden" name="query_id" value={query.id} />
                <input type="hidden" name="question_id" value={question.id} />
                <Button type="submit" variant="danger-link">
                  Remove
                </Button>
              </form>
            )}
          </div>
        </Card>
      ))}

      {editability.canAdd ? (
        <Card className="border-dashed p-5">
          <SectionHeading className="mb-1">Add question {questions.length + 1}</SectionHeading>
          <p className="mb-4 text-xs text-ink-400">
            {MAX_QUESTIONS - questions.length} of {MAX_QUESTIONS} slots left.
          </p>
          <form action={addQuestion} className="flex flex-col gap-4">
            <input type="hidden" name="query_id" value={query.id} />
            <QuestionFields
              idPrefix="new"
              defaults={{
                prompt: "",
                guidance: "",
                internalContext: "",
                required: false,
                maxDurationSeconds: DEFAULT_MAX_DURATION_SECONDS,
              }}
            />
            <div>
              <Button type="submit">Add question</Button>
            </div>
          </form>
        </Card>
      ) : (
        <p className="text-sm text-ink-400">A query can have at most {MAX_QUESTIONS} questions.</p>
      )}
    </div>
  );
}

function QuestionFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults: {
    prompt: string;
    guidance: string;
    internalContext: string;
    required: boolean;
    maxDurationSeconds: number;
  };
}) {
  return (
    <>
      <Field
        label="Prompt"
        htmlFor={`${idPrefix}-prompt`}
        hint="The question read aloud in the participant's head. Keep it to one idea."
      >
        <Textarea
          id={`${idPrefix}-prompt`}
          name="prompt"
          rows={2}
          required
          defaultValue={defaults.prompt}
          placeholder="How has the rising cost of housing affected you or your family?"
        />
      </Field>
      <Field
        label="Public guidance (optional)"
        htmlFor={`${idPrefix}-guidance`}
        hint="Shown under the prompt, to help someone who isn't sure what to say."
      >
        <Textarea
          id={`${idPrefix}-guidance`}
          name="guidance"
          rows={2}
          defaultValue={defaults.guidance}
          placeholder="You might describe changes in rent or mortgage costs, difficulty finding housing, moving, or other personal effects."
        />
      </Field>
      <Field label="Internal context (optional)" htmlFor={`${idPrefix}-internal_context`}>
        <Input
          id={`${idPrefix}-internal_context`}
          name="internal_context"
          defaultValue={defaults.internalContext}
          placeholder="Why we're asking — for the desk, not for participants"
        />
      </Field>
      <div className="flex flex-wrap items-end gap-6">
        <Field
          label="Maximum length (seconds)"
          htmlFor={`${idPrefix}-max_duration_seconds`}
          className="w-44"
        >
          <Input
            id={`${idPrefix}-max_duration_seconds`}
            name="max_duration_seconds"
            type="number"
            min={MIN_MAX_DURATION_SECONDS}
            max={MAX_MAX_DURATION_SECONDS}
            step={15}
            defaultValue={defaults.maxDurationSeconds}
          />
        </Field>
        <CheckboxField
          name="required"
          defaultChecked={defaults.required}
          className="mb-2.5 items-center"
          label="Required — a participant can't submit without answering this"
        />
      </div>
    </>
  );
}
