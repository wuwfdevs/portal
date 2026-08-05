"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { buildMailtoUrl, interpolateTemplate } from "@/lib/academic-partnerships/email";
import type { ApEmailTemplateRow } from "@/lib/academic-partnerships/queries";
import { recordEmailAction, sendInquiryEmail } from "../actions";

/**
 * Two ways an email leaves this system, both logged identically afterward
 * (see actions.ts's afterEmailAction()): sendInquiryEmail() actually sends
 * via Resend when lib/email.ts is configured, and recordEmailAction() is the
 * manual fallback — a mailto: draft or copied text the coordinator sends
 * themselves, then confirms. The manual path stays available even when
 * sending is configured: CC'ing someone, personalizing beyond what the
 * template does, or simply preferring to send from their own mail client are
 * all reasons to not force the automatic path.
 */
export function EmailPanel({
  submission,
  templates,
  appointmentsUrl,
  sendingConfigured,
}: {
  submission: { id: string; faculty_name: string; email: string };
  templates: ApEmailTemplateRow[];
  appointmentsUrl: string | null;
  sendingConfigured: boolean;
}) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [staffContext, setStaffContext] = useState("");
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(!sendingConfigured);

  const template = templates.find((candidate) => candidate.key === templateKey) ?? null;
  const interpolated = useMemo(
    () =>
      template
        ? interpolateTemplate(template, {
            facultyName: submission.faculty_name,
            appointmentsUrl,
            staffContext,
          })
        : null,
    [template, submission.faculty_name, appointmentsUrl, staffContext],
  );
  const mailto = interpolated ? buildMailtoUrl(submission.email, interpolated.subject, interpolated.body) : null;
  const isMeetingInvite = templateKey === "meeting_invite";

  async function copyDraft() {
    if (!interpolated) return;
    await navigator.clipboard.writeText(`Subject: ${interpolated.subject}\n\n${interpolated.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded border border-line p-4">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-400">Email</h2>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="template_key">Template</Label>
          <Select
            id="template_key"
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value)}
          >
            {templates.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.label}
              </option>
            ))}
          </Select>
        </div>

        {isMeetingInvite && !appointmentsUrl && (
          <Alert variant="note">
            No Google Appointments URL is configured yet — set one in Settings, or add it by hand
            below.
          </Alert>
        )}

        <div>
          <Label htmlFor="staff_context">Add context (optional)</Label>
          <Textarea
            id="staff_context"
            rows={3}
            value={staffContext}
            onChange={(event) => setStaffContext(event.target.value)}
            placeholder="A sentence or two specific to this inquiry"
          />
        </div>

        {interpolated && (
          <div className="rounded border border-line bg-panel-50 p-3">
            <p className="text-xs font-semibold text-ink-700">{interpolated.subject}</p>
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">
              {interpolated.body}
            </p>
          </div>
        )}

        {sendingConfigured && interpolated && (
          <form action={sendInquiryEmail} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="submission_id" value={submission.id} />
            <input type="hidden" name="template_key" value={templateKey} />
            <input type="hidden" name="template_label" value={template?.label ?? ""} />
            <input type="hidden" name="to" value={submission.email} />
            <input type="hidden" name="subject" value={interpolated.subject} />
            <input type="hidden" name="body" value={interpolated.body} />
            {isMeetingInvite && (
              <>
                <label className="flex items-start gap-2 text-xs text-ink-700">
                  <input type="checkbox" name="move_to_meeting_requested" defaultChecked className="mt-0.5" />
                  Move this submission to Meeting Requested
                </label>
                <label className="flex items-start gap-2 text-xs text-ink-700">
                  <input type="checkbox" name="appointment_link_shared" defaultChecked className="mt-0.5" />
                  Record that the appointments link was included
                </label>
              </>
            )}
            <Button type="submit" className="self-start">
              Send email to {submission.email}
            </Button>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => mailto && (window.location.href = mailto)}
          >
            Open email draft
          </Button>
          <Button type="button" variant="secondary" onClick={copyDraft}>
            {copied ? "Copied" : "Copy draft"}
          </Button>
          {sendingConfigured && !showManual && (
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-xs font-semibold text-brand-link hover:underline"
            >
              I sent this myself instead
            </button>
          )}
        </div>

        {showManual && (
          <form action={recordEmailAction} className="flex flex-col gap-2 border-t border-line pt-3">
            <input type="hidden" name="submission_id" value={submission.id} />
            <input type="hidden" name="template_key" value={templateKey} />
            <input type="hidden" name="template_label" value={template?.label ?? ""} />
            {isMeetingInvite && (
              <>
                <label className="flex items-start gap-2 text-xs text-ink-700">
                  <input type="checkbox" name="move_to_meeting_requested" defaultChecked className="mt-0.5" />
                  Move this submission to Meeting Requested
                </label>
                <label className="flex items-start gap-2 text-xs text-ink-700">
                  <input type="checkbox" name="appointment_link_shared" defaultChecked className="mt-0.5" />
                  Record that the appointments link was included
                </label>
              </>
            )}
            <Button type="submit" variant={sendingConfigured ? "secondary" : "primary"} className="self-start">
              I sent this email
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
