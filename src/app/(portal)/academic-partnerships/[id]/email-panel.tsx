"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { buildMailtoUrl, interpolateTemplate } from "@/lib/academic-partnerships/email";
import type { ApEmailTemplateRow } from "@/lib/academic-partnerships/queries";
import { recordEmailAction } from "../actions";

/**
 * There is no transactional email sender in this repository (see design doc
 * §3 "Email"), so every action here prepares a draft — a mailto: link and a
 * copy-to-clipboard button — and "I sent this email" only records that the
 * draft was prepared and confirmed sent, never that it was delivered.
 * "Invite to meet" additionally offers to move the record to Meeting
 * Requested, per the brief.
 */
export function EmailPanel({
  submission,
  templates,
  appointmentsUrl,
}: {
  submission: { id: string; faculty_name: string; email: string };
  templates: ApEmailTemplateRow[];
  appointmentsUrl: string | null;
}) {
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [staffContext, setStaffContext] = useState("");
  const [copied, setCopied] = useState(false);

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

        <div className="flex flex-wrap gap-2">
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
        </div>

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
          <Button type="submit" className="self-start">
            I sent this email
          </Button>
        </form>
      </div>
    </section>
  );
}
