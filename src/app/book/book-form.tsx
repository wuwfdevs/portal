"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  AIRTIME_LENGTH_OPTIONS,
  INTAKE_LOCATION_MAX,
  INTAKE_PARTNER_MAX,
  INTAKE_STEP_TITLE,
  INTAKE_TITLE_MAX,
  PARTNER_KIND_OPTIONS,
  REQUESTED_OPTIONS,
  intakeAsksForAirtime,
  intakeAsksForProduction,
  visibleIntakeSteps,
  type IntakeStepId,
} from "@/lib/bookings/intake";
import { BOOK_PAGE_TITLE } from "./title";
import { submitRequest, type SubmitRequestState } from "./actions";

const initialState: SubmitRequestState = { status: "idle" };

/**
 * A short wizard, the src/app/partner/partner-form.tsx shape and its two
 * hard-won rules: every step stays mounted and is shown or hidden by one
 * conditional className (never the `hidden` attribute beside a display
 * utility, never unmounted — Back/Next must not lose a value), and the
 * Next/Send button is always type="button" (a focused button whose type
 * flips to "submit" fires a real premature submission); the last step
 * calls requestSubmit() instead.
 */
export function BookForm({
  introCopy,
  offeredPackages,
}: {
  introCopy: string;
  offeredPackages: string[];
}) {
  const [state, formAction, isPending] = useActionState(submitRequest, initialState);
  const [requested, setRequested] = useState("production");
  const [renderedAt] = useState(() => Date.now());
  const [stepId, setStepId] = useState<IntakeStepId>("about");
  const stepRefs = useRef<Partial<Record<IntakeStepId, HTMLDivElement | null>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const steps = useMemo(() => visibleIntakeSteps(requested), [requested]);
  const currentIndex = Math.max(0, steps.indexOf(stepId));
  const current = steps[currentIndex]!;
  const isLastStep = currentIndex === steps.length - 1;

  if (state.status === "submitted") {
    return (
      <div>
        <PageHeader size="public" title="Request received" className="mb-3" />
        <p className="text-[15px] leading-relaxed text-ink-700">{state.confirmationCopy}</p>
      </div>
    );
  }

  function goNext() {
    const container = stepRefs.current[current];
    if (container) {
      const invalid = Array.from(container.querySelectorAll<HTMLInputElement>("[required]")).find(
        (el) => !el.checkValidity(),
      );
      if (invalid) {
        invalid.reportValidity();
        return;
      }
    }
    const next = steps[currentIndex + 1];
    if (next) setStepId(next);
  }

  function goBack() {
    const previous = steps[currentIndex - 1];
    if (previous) setStepId(previous);
  }

  const stepClass = (id: IntakeStepId) => cn("flex-col gap-4", current === id ? "flex" : "hidden");

  return (
    <div>
      <PageHeader size="public" title={BOOK_PAGE_TITLE} className="mb-2" />

      <ProgressBar
        size="sm"
        label="Form progress"
        done={currentIndex + 1}
        total={steps.length}
        valueText={`Step ${currentIndex + 1} of ${steps.length}`}
        className="mb-1"
      />
      <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-ink-400">
        Step {currentIndex + 1} of {steps.length} — {INTAKE_STEP_TITLE[current]}
      </p>

      {current === "about" && (
        <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-700">
          {introCopy}
        </p>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-5">
        {/* Honeypot: off-screen (not display:none, which some bots skip),
            aria-hidden and unreachable by keyboard. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <input type="hidden" name="rendered_at" value={renderedAt} />
        {/* What the form offered, so the action can refuse a name outside it
            before the round trip; bk_submit_request() checks it again. */}
        {offeredPackages.map((name) => (
          <input key={name} type="hidden" name="offered_packages" value={name} />
        ))}

        <div
          ref={(el) => {
            stepRefs.current.about = el;
          }}
          className={stepClass("about")}
        >
          <Field label="Your name" htmlFor="contact_name">
            <Input id="contact_name" name="contact_name" required autoComplete="name" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="contact_email">
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                required
                autoComplete="email"
              />
            </Field>
            <Field label="Phone (optional)" htmlFor="contact_phone">
              <Input id="contact_phone" name="contact_phone" type="tel" autoComplete="tel" />
            </Field>
          </div>
          <Field label="Your college, department, office or organization" htmlFor="partner_name">
            <Input
              id="partner_name"
              name="partner_name"
              required
              maxLength={INTAKE_PARTNER_MAX}
              autoComplete="organization"
            />
          </Field>
          <Field label="You are" htmlFor="partner_kind">
            <Select id="partner_kind" name="partner_kind" defaultValue="uwf_unit">
              {PARTNER_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.ask = el;
          }}
          className={stepClass("ask")}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-semibold text-ink-700">
              You are asking for
            </legend>
            {REQUESTED_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-start gap-3 rounded border border-line px-3 py-2.5 hover:border-brand-primary"
              >
                <input
                  type="radio"
                  name="requested"
                  value={option.value}
                  checked={requested === option.value}
                  onChange={() => setRequested(option.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink-800">{option.label}</span>
                  <span className="block text-xs leading-relaxed text-ink-500">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="A short title for the request" htmlFor="title">
            <Input
              id="title"
              name="title"
              required
              maxLength={INTAKE_TITLE_MAX}
              placeholder="Board of Trustees meeting webcast"
            />
          </Field>
          {intakeAsksForProduction(requested) && offeredPackages.length > 0 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-xs font-semibold text-ink-700">
                Which services? (choose any that apply)
              </legend>
              {offeredPackages.map((name) => (
                <CheckboxField key={name} name="packages" value={name} label={name} />
              ))}
            </fieldset>
          )}
          <Field label="Describe what you need" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              rows={4}
              required
              placeholder={
                intakeAsksForAirtime(requested)
                  ? "What it is, who it is for, and what should air — a message, a feature, a promo."
                  : "What it is, who it is for, and what you would like WUWF to produce."
              }
            />
          </Field>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.when = el;
          }}
          className={stepClass("when")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Event or recording starts (optional)" htmlFor="event_starts_on">
              <Input id="event_starts_on" name="event_starts_on" type="date" />
            </Field>
            <Field label="Ends (optional)" htmlFor="event_ends_on">
              <Input id="event_ends_on" name="event_ends_on" type="date" />
            </Field>
          </div>
          <Field label="When you need the finished work (optional)" htmlFor="deliverables_due_on">
            <Input id="deliverables_due_on" name="deliverables_due_on" type="date" />
          </Field>
          <Field label="Location (optional)" htmlFor="location">
            <Input
              id="location"
              name="location"
              maxLength={INTAKE_LOCATION_MAX}
              placeholder="A room, a building, or on campus"
            />
          </Field>
          <p className="text-xs leading-relaxed text-ink-400">
            Dates are not booked by this form. WUWF checks them against the studio and field
            calendar and holds them when it sends you an estimate.
          </p>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.airtime = el;
          }}
          className={stepClass("airtime")}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Airings a week (optional)" htmlFor="airings_per_week">
              <Input id="airings_per_week" name="airings_per_week" type="number" min="1" max="99" />
            </Field>
            <Field label="Length of each airing (optional)" htmlFor="seconds">
              <Select id="seconds" name="seconds" defaultValue="">
                <option value="">Not sure yet</option>
                {AIRTIME_LENGTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First airing (optional)" htmlFor="airtime_starts_on">
              <Input id="airtime_starts_on" name="airtime_starts_on" type="date" />
            </Field>
            <Field label="Last airing (optional)" htmlFor="airtime_ends_on">
              <Input id="airtime_ends_on" name="airtime_ends_on" type="date" />
            </Field>
          </div>
          <p className="text-xs leading-relaxed text-ink-400">
            Airtime on WUWF is limited and scheduled by the station. Say what you can; WUWF will
            talk through what is possible.
          </p>
        </div>

        <div
          ref={(el) => {
            stepRefs.current.wrapup = el;
          }}
          className={stepClass("wrapup")}
        >
          <Alert variant="note">
            Sending this form does not book a date or commit WUWF to the work. WUWF&apos;s
            production staff will review the request and follow up by email with an estimate;
            nothing is scheduled until you approve it.
          </Alert>
        </div>

        {state.status === "error" && <Alert variant="danger">{state.message}</Alert>}

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="secondary" onClick={goBack} disabled={currentIndex === 0}>
            Back
          </Button>
          <Button
            type="button"
            onClick={isLastStep ? () => formRef.current?.requestSubmit() : goNext}
            disabled={isPending}
          >
            {isLastStep ? (isPending ? "Sending…" : "Send the request") : "Next"}
          </Button>
        </div>
      </form>
    </div>
  );
}
