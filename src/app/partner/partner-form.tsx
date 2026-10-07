"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  PARTNERSHIP_TYPE_DESCRIPTION,
  PARTNERSHIP_TYPE_LABEL,
  hasCourseBasedTrack,
  hasResearchTrack,
} from "@/lib/academic-partnerships/partnership-types";
import type { ApPartnershipType } from "@/lib/database.types";
import { submitInquiry, type SubmitInquiryState } from "./actions";

const initialState: SubmitInquiryState = { status: "idle" };

type StepId = "about" | "reach" | "tracks" | "details" | "engagement" | "research" | "wrapup";

interface StepDef {
  id: StepId;
  title: string;
  visible: (types: ApPartnershipType[]) => boolean;
}

const ALL_STEPS: StepDef[] = [
  { id: "about", title: "About you", visible: () => true },
  { id: "reach", title: "Reach & timing", visible: () => true },
  { id: "tracks", title: "Choose your track(s)", visible: () => true },
  { id: "details", title: "About the partnership", visible: () => true },
  {
    id: "engagement",
    title: "What this could look like",
    visible: (types) => types.some((t) => t !== "faculty_research"),
  },
  { id: "research", title: "Research & expertise", visible: hasResearchTrack },
  { id: "wrapup", title: "A few more details", visible: () => true },
];

/** Each step's own container fits comfortably without scrolling — small field counts per step (never more than four), matching the brief's "each step fits comfortably in the viewport." */
export function PartnerForm({
  introCopy,
  enabledPartnershipTypes,
}: {
  introCopy: string;
  enabledPartnershipTypes: ApPartnershipType[];
}) {
  const [state, formAction, isPending] = useActionState(submitInquiry, initialState);
  const [selectedTypes, setSelectedTypes] = useState<ApPartnershipType[]>([]);
  const [renderedAt] = useState(() => Date.now());
  const [stepId, setStepId] = useState<StepId>("about");
  const [stepError, setStepError] = useState<string | null>(null);
  const stepRefs = useRef<Partial<Record<StepId, HTMLDivElement | null>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const visibleSteps = useMemo(
    () => ALL_STEPS.filter((step) => step.visible(selectedTypes)),
    [selectedTypes],
  );
  const currentIndex = visibleSteps.findIndex((step) => step.id === stepId);
  const current = visibleSteps[currentIndex] ?? visibleSteps[0]!;

  if (state.status === "submitted") {
    return (
      <div>
        <PageHeader size="public" title="Inquiry received" className="mb-3" />
        <p className="text-[15px] leading-relaxed text-ink-700">{state.confirmationCopy}</p>
      </div>
    );
  }

  function goNext() {
    setStepError(null);
    if (current.id === "tracks" && selectedTypes.length === 0) {
      setStepError("Choose at least one collaboration track to continue.");
      return;
    }
    const container = stepRefs.current[current.id];
    if (container) {
      const invalid = Array.from(container.querySelectorAll<HTMLInputElement>("[required]")).find(
        (el) => !el.checkValidity(),
      );
      if (invalid) {
        invalid.reportValidity();
        return;
      }
    }
    const next = visibleSteps[currentIndex + 1];
    if (next) setStepId(next.id);
  }

  function goBack() {
    setStepError(null);
    const previous = visibleSteps[currentIndex - 1];
    if (previous) setStepId(previous.id);
  }

  function toggleType(type: ApPartnershipType) {
    setSelectedTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );
  }

  const isLastStep = currentIndex === visibleSteps.length - 1;

  return (
    <div>
      <PageHeader size="public" title="WUWF Applied Media Partnership Program" className="mb-2" />

      <ProgressBar
        size="sm"
        label="Form progress"
        done={currentIndex + 1}
        total={visibleSteps.length}
        valueText={`Step ${currentIndex + 1} of ${visibleSteps.length}`}
        className="mb-1"
      />
      <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Step {currentIndex + 1} of {visibleSteps.length} — {current.title}
      </p>

      {current.id === "about" && (
        <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
          {introCopy}
        </p>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-5">
        {/* Honeypot: off-screen (not display:none, which some bots skip),
            aria-hidden and unreachable by keyboard, so it is invisible and
            inert to a sighted or assistive-technology visitor. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <input type="hidden" name="rendered_at" value={renderedAt} />

        <div
          ref={(el) => {
            stepRefs.current.about = el;
          }}
          className={cn("flex-col gap-4", stepId === "about" ? "flex" : "hidden")}
        >
          <Field label="Your name" htmlFor="faculty_name">
            <Input id="faculty_name" name="faculty_name" required autoComplete="name" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="UWF email" htmlFor="email">
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Phone (optional)" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" autoComplete="tel" />
            </Field>
          </div>
          <Field label="Department or academic program" htmlFor="department">
            <Input id="department" name="department" required />
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.reach = el;
          }}
          className={cn("flex-col gap-4", stepId === "reach" ? "flex" : "hidden")}
        >
          <Field label="Semester or anticipated timeframe (optional)" htmlFor="timeframe">
            <Input id="timeframe" name="timeframe" placeholder="e.g. Spring 2027" />
          </Field>
          <Field label="Estimated students reached (optional)" htmlFor="estimated_students_reached">
            <Input
              id="estimated_students_reached"
              name="estimated_students_reached"
              type="number"
              min="0"
            />
          </Field>
          <p className="text-xs leading-relaxed text-ink-400">
            A rough number is fine — this helps WUWF understand the overall reach of its academic
            partnerships.
          </p>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.tracks = el;
          }}
          className={cn("flex-col gap-3", stepId === "tracks" ? "flex" : "hidden")}
        >
          <p className="text-[13px] leading-relaxed text-ink-500">
            Choose everything that fits — you can select more than one.
          </p>
          {enabledPartnershipTypes.map((type) => (
            <label
              key={type}
              className="flex items-start gap-3 rounded border border-line px-3 py-2.5 hover:border-brand-primary"
            >
              <input
                type="checkbox"
                name="partnership_types"
                value={type}
                checked={selectedTypes.includes(type)}
                onChange={() => toggleType(type)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-ink-800">
                  {PARTNERSHIP_TYPE_LABEL[type]}
                </span>
                <span className="block text-xs leading-relaxed text-ink-500">
                  {PARTNERSHIP_TYPE_DESCRIPTION[type]}
                </span>
              </span>
            </label>
          ))}
          {stepError && <Alert variant="danger">{stepError}</Alert>}
        </div>

        <div
          ref={(el) => {
            stepRefs.current.details = el;
          }}
          className={cn("flex-col gap-4", stepId === "details" ? "flex" : "hidden")}
        >
          <Field label="Briefly describe the proposed partnership" htmlFor="description">
            <Textarea id="description" name="description" rows={4} required />
          </Field>
          {hasCourseBasedTrack(selectedTypes) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Course title (optional)" htmlFor="course_title">
                <Input id="course_title" name="course_title" />
              </Field>
              <Field label="Course number (optional)" htmlFor="course_number">
                <Input id="course_number" name="course_number" />
              </Field>
            </div>
          )}
          <Field
            label="Relevant dates, deadlines, or embargoes (optional)"
            htmlFor="relevant_dates"
          >
            <Input id="relevant_dates" name="relevant_dates" />
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.engagement = el;
          }}
          className={cn("flex-col gap-4", stepId === "engagement" ? "flex" : "hidden")}
        >
          <Field
            label="What do you want students to experience, practice, or produce? (optional)"
            htmlFor="student_experience"
          >
            <Textarea id="student_experience" name="student_experience" rows={3} />
          </Field>
          <Field
            label="What support are you seeking from WUWF? (optional)"
            htmlFor="support_requested"
          >
            <Textarea id="support_requested" name="support_requested" rows={2} />
          </Field>
          <Field label="Anticipated deliverables (optional)" htmlFor="deliverables">
            <Textarea id="deliverables" name="deliverables" rows={2} />
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.research = el;
          }}
          className={cn("flex-col gap-4", stepId === "research" ? "flex" : "hidden")}
        >
          <Field label="Topic or area of expertise" htmlFor="research_topic">
            <Input
              id="research_topic"
              name="research_topic"
              required={hasResearchTrack(selectedTypes)}
            />
          </Field>
          <Field label="Regional or public relevance (optional)" htmlFor="research_relevance">
            <Textarea id="research_relevance" name="research_relevance" rows={2} />
          </Field>
          <Field label="Status of the work (optional)" htmlFor="research_status">
            <Input
              id="research_status"
              name="research_status"
              placeholder="e.g. in progress, under review, published"
            />
          </Field>
          <Field
            label="Your availability for interviews, consultation, or public programs (optional)"
            htmlFor="research_availability"
          >
            <Textarea id="research_availability" name="research_availability" rows={2} />
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.wrapup = el;
          }}
          className={cn("flex-col gap-4", stepId === "wrapup" ? "flex" : "hidden")}
        >
          <Field label="Additional context (optional)" htmlFor="additional_context">
            <Textarea id="additional_context" name="additional_context" rows={3} />
          </Field>
          <CheckboxField
            name="may_publish"
            label="I would be comfortable with WUWF publishing or distributing work that comes out of this partnership."
          />
          <Alert variant="note">
            Submitting this form does not guarantee a partnership, publication, distribution, or
            news coverage. WUWF will review your inquiry and follow up by email.
          </Alert>
        </div>

        {state.status === "error" && <Alert variant="danger">{state.message}</Alert>}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={goBack} disabled={currentIndex === 0}>
            Back
          </Button>
          {/* Deliberately always type="button", on both branches — never a
              native type="submit" that would need to appear at this same
              JSX position once isLastStep flips. React patches props onto
              the same underlying <button> DOM node rather than remounting
              it, and mutating a *focused, just-clicked* button's type from
              "button" to "submit" mid-click turned out to fire a real,
              premature form submission in testing (confirmed via a stray
              POST on the very click that reached the last step, wiping
              every field's value). formRef.requestSubmit() submits the form
              exactly like a real submit button would — same useActionState
              handling, same native required-field validation — without ever
              putting type="submit" at a position type="button" occupied a
              moment earlier. */}
          <Button
            type="button"
            onClick={isLastStep ? () => formRef.current?.requestSubmit() : goNext}
            disabled={isPending}
          >
            {isLastStep ? (isPending ? "Submitting…" : "Submit inquiry") : "Next"}
          </Button>
        </div>
      </form>
    </div>
  );
}
