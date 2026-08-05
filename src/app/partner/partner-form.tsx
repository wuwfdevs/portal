"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  isCourseBasedType,
  isResearchType,
  PARTNERSHIP_TYPE_LABEL,
} from "@/lib/academic-partnerships/partnership-types";
import type { ApPartnershipType } from "@/lib/database.types";
import { submitInquiry, type SubmitInquiryState } from "./actions";

const initialState: SubmitInquiryState = { status: "idle" };

export function PartnerForm({
  introCopy,
  enabledPartnershipTypes,
}: {
  introCopy: string;
  enabledPartnershipTypes: ApPartnershipType[];
}) {
  const [state, formAction, isPending] = useActionState(submitInquiry, initialState);
  const [partnershipType, setPartnershipType] = useState<ApPartnershipType | "">("");
  const [renderedAt] = useState(() => Date.now());

  if (state.status === "submitted") {
    return (
      <div>
        <h1 className="mb-3 font-serif text-[20px] font-bold text-ink-900">Inquiry received</h1>
        <p className="text-[15px] leading-relaxed text-ink-700">{state.confirmationCopy}</p>
      </div>
    );
  }

  const showCourseFields = partnershipType ? isCourseBasedType(partnershipType) : false;
  const showResearchFields = partnershipType ? isResearchType(partnershipType) : false;

  return (
    <div>
      <h1 className="mb-2 font-serif text-[20px] font-bold text-ink-900">
        WUWF Applied Media Partnership Program
      </h1>
      <p className="mb-6 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">{introCopy}</p>

      <form action={formAction} className="flex flex-col gap-5">
        {/* Honeypot: off-screen (not display:none, which some bots skip),
            aria-hidden and unreachable by keyboard, so it is invisible and
            inert to a sighted or assistive-technology visitor. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <input type="hidden" name="rendered_at" value={renderedAt} />

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">About you</h2>
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
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            The partnership
          </h2>
          <Field label="Type of partnership" htmlFor="partnership_type">
            <Select
              id="partnership_type"
              name="partnership_type"
              required
              value={partnershipType}
              onChange={(event) => setPartnershipType(event.target.value as ApPartnershipType)}
            >
              <option value="" disabled>
                Choose one
              </option>
              {enabledPartnershipTypes.map((type) => (
                <option key={type} value={type}>
                  {PARTNERSHIP_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>

          {showCourseFields && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Course title" htmlFor="course_title">
                  <Input id="course_title" name="course_title" />
                </Field>
                <Field label="Course number" htmlFor="course_number">
                  <Input id="course_number" name="course_number" />
                </Field>
              </div>
              <Field label="Approximate enrollment" htmlFor="enrollment_estimate">
                <Input id="enrollment_estimate" name="enrollment_estimate" type="number" min="0" />
              </Field>
            </>
          )}

          <Field label="Semester or anticipated timeframe" htmlFor="timeframe">
            <Input id="timeframe" name="timeframe" placeholder="e.g. Spring 2027" />
          </Field>

          {!showResearchFields && (
            <Field label="Learning objectives" htmlFor="learning_objectives" optional>
              <Textarea id="learning_objectives" name="learning_objectives" rows={3} />
            </Field>
          )}

          <Field label="Briefly describe the proposed partnership" htmlFor="description">
            <Textarea id="description" name="description" rows={4} required />
          </Field>

          {!showResearchFields && (
            <>
              <Field
                label="What do you want students to experience, practice, or produce?"
                htmlFor="student_experience"
                optional
              >
                <Textarea id="student_experience" name="student_experience" rows={3} />
              </Field>
              <Field label="What support are you seeking from WUWF?" htmlFor="support_requested" optional>
                <Textarea id="support_requested" name="support_requested" rows={3} />
              </Field>
              <Field label="Anticipated deliverables" htmlFor="deliverables" optional>
                <Textarea id="deliverables" name="deliverables" rows={2} />
              </Field>
            </>
          )}

          <Field label="Relevant dates or deadlines" htmlFor="relevant_dates" optional>
            <Input id="relevant_dates" name="relevant_dates" />
          </Field>
        </section>

        {showResearchFields && (
          <section className="flex flex-col gap-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
              Research &amp; expertise
            </h2>
            <Field label="Topic or area of expertise" htmlFor="research_topic">
              <Input id="research_topic" name="research_topic" required />
            </Field>
            <Field label="Plain-language summary" htmlFor="research_summary">
              <Textarea id="research_summary" name="research_summary" rows={3} required />
            </Field>
            <Field label="Regional or public relevance" htmlFor="research_relevance" optional>
              <Textarea id="research_relevance" name="research_relevance" rows={2} />
            </Field>
            <Field label="Status of the work" htmlFor="research_status" optional>
              <Input
                id="research_status"
                name="research_status"
                placeholder="e.g. in progress, under review, published"
              />
            </Field>
            <Field label="Supporting links or materials" htmlFor="research_links" optional>
              <Textarea
                id="research_links"
                name="research_links"
                rows={2}
                placeholder="One link or citation per line"
              />
            </Field>
            <Field label="Relevant dates or embargoes" htmlFor="research_dates" optional>
              <Input id="research_dates" name="research_dates" />
            </Field>
            <Field
              label="Your availability for interviews, consultation, or public programs"
              htmlFor="research_availability"
              optional
            >
              <Textarea id="research_availability" name="research_availability" rows={2} />
            </Field>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            A few more details
          </h2>
          <Field label="Additional context" htmlFor="additional_context" optional>
            <Textarea id="additional_context" name="additional_context" rows={3} />
          </Field>
          <label className="flex items-start gap-2.5 text-[13px] leading-snug text-ink-700">
            <input type="checkbox" name="may_publish" className="mt-0.5" />
            I would be comfortable with WUWF publishing or distributing work that comes out of this
            partnership.
          </label>
        </section>

        <Alert variant="note">
          Submitting this form does not guarantee a partnership, publication, distribution, or news
          coverage. WUWF will review your inquiry and follow up by email.
        </Alert>

        {state.status === "error" && <Alert variant="danger">{state.message}</Alert>}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Submitting…" : "Submit inquiry"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? " (optional)" : ""}
      </Label>
      {children}
    </div>
  );
}
