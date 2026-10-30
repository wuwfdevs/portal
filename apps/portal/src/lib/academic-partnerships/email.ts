// Pure template interpolation and mailto: construction. No Supabase, no
// React. There is no transactional email sender in this repository (see
// design doc §3 "Email") — every action here prepares a draft for a
// mailto: link or copy-to-clipboard, never sends anything itself.

export interface TemplateVars {
  facultyName: string;
  appointmentsUrl?: string | null;
  staffContext?: string;
}

/** Replaces every {{token}} the templates use. An unset appointments URL reads as a plain sentence, not a broken link. */
export function interpolateTemplate(
  template: { subject: string; body: string },
  vars: TemplateVars,
): { subject: string; body: string } {
  const replacements: Record<string, string> = {
    faculty_name: vars.facultyName,
    appointments_url:
      vars.appointmentsUrl?.trim() || "(no scheduling link has been configured yet)",
    staff_context: vars.staffContext?.trim() || "",
  };

  const fill = (text: string): string =>
    text.replace(/\{\{(\w+)\}\}/g, (match, token: string) => replacements[token] ?? match);

  return { subject: fill(template.subject), body: fill(template.body) };
}

/** A mailto: link with the subject and body prefilled. */
export function buildMailtoUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}
