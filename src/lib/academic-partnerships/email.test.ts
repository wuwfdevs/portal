import { describe, expect, it } from "vitest";
import { buildMailtoUrl, interpolateTemplate } from "./email";

describe("interpolateTemplate", () => {
  const template = {
    subject: "Following up, {{faculty_name}}",
    body: "Hi {{faculty_name}}, book here: {{appointments_url}}\n\n{{staff_context}}",
  };

  it("fills in every token", () => {
    const result = interpolateTemplate(template, {
      facultyName: "Dr. Rivera",
      appointmentsUrl: "https://calendar.example/wuwf",
      staffContext: "Loved your pitch on the housing beat.",
    });
    expect(result.subject).toBe("Following up, Dr. Rivera");
    expect(result.body).toBe(
      "Hi Dr. Rivera, book here: https://calendar.example/wuwf\n\nLoved your pitch on the housing beat.",
    );
  });

  it("reads as a plain sentence when no appointments URL is configured, not a broken link", () => {
    const result = interpolateTemplate(template, { facultyName: "Dr. Rivera" });
    expect(result.body).toContain("(no scheduling link has been configured yet)");
  });

  it("leaves staff context blank rather than literal", () => {
    const result = interpolateTemplate(template, { facultyName: "Dr. Rivera" });
    expect(result.body.trim().endsWith("book here: (no scheduling link has been configured yet)")).toBe(
      true,
    );
  });
});

describe("buildMailtoUrl", () => {
  it("encodes subject and body as query parameters", () => {
    const url = buildMailtoUrl("faculty@uwf.edu", "Hi there", "Line one & two");
    expect(url.startsWith("mailto:faculty%40uwf.edu?")).toBe(true);
    expect(url).toContain("subject=Hi+there");
    expect(url).toContain("body=Line+one+%26+two");
  });
});
