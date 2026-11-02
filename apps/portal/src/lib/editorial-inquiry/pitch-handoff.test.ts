import { describe, expect, it } from "vitest";
import { buildPitchHandoffDraft, pitchHandoffUrl } from "./pitch-handoff";
import type { ContextNoteRecord } from "./tree";

function note(
  overrides: Partial<ContextNoteRecord> & Pick<ContextNoteRecord, "evidentiaryStatus">,
): ContextNoteRecord {
  return {
    id: "note1",
    questionId: "q1",
    kind: "note",
    body: "Some context",
    sourceTitle: null,
    sourceUrl: null,
    createdBy: null,
    createdAt: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}

describe("buildPitchHandoffDraft", () => {
  it("carries the story question's own text as both title and central question", () => {
    const draft = buildPitchHandoffDraft({
      storyQuestion: {
        text: "How many junior-enlisted families have taken on second jobs since 2023?",
      },
      pillarName: "Military Affairs",
      inheritedNotes: [],
    });
    expect(draft.title).toBe(
      "How many junior-enlisted families have taken on second jobs since 2023?",
    );
    expect(draft.centralQuestion).toBe(draft.title);
    expect(draft.primaryPillar).toBe("Military Affairs");
  });

  it("truncates a very long question for the title but keeps the full text as the central question", () => {
    const longText = "A".repeat(250);
    const draft = buildPitchHandoffDraft({
      storyQuestion: { text: longText },
      pillarName: "Military Affairs",
      inheritedNotes: [],
    });
    expect(draft.title.length).toBe(200);
    expect(draft.title.endsWith("…")).toBe(true);
    expect(draft.centralQuestion).toBe(longText);
  });

  it("builds sources_materials from every inherited note, labeled by evidentiary status", () => {
    const draft = buildPitchHandoffDraft({
      storyQuestion: { text: "Q" },
      pillarName: "Military Affairs",
      inheritedNotes: [
        note({ evidentiaryStatus: "hunch", body: "A reporter's hunch" }),
        note({ evidentiaryStatus: "established_fact", body: "A confirmed fact" }),
      ],
    });
    expect(draft.sourcesMaterials).toContain("[Hunch] A reporter's hunch");
    expect(draft.sourcesMaterials).toContain("[Established fact] A confirmed fact");
  });

  it("builds why_now only from established_fact/web_finding notes, never a hunch", () => {
    const draft = buildPitchHandoffDraft({
      storyQuestion: { text: "Q" },
      pillarName: "Military Affairs",
      inheritedNotes: [
        note({ evidentiaryStatus: "hunch", body: "A reporter's hunch" }),
        note({ evidentiaryStatus: "source_claim", body: "Something a source said" }),
        note({ evidentiaryStatus: "established_fact", body: "A confirmed fact" }),
        note({
          evidentiaryStatus: "web_finding",
          body: "Found via search",
          sourceUrl: "https://example.com",
        }),
      ],
    });
    expect(draft.whyNow).not.toContain("hunch");
    expect(draft.whyNow).not.toContain("source said");
    expect(draft.whyNow).toContain("A confirmed fact");
    expect(draft.whyNow).toContain("Found via search");
  });

  it("leaves why_now empty rather than fabricating one when nothing qualifies", () => {
    const draft = buildPitchHandoffDraft({
      storyQuestion: { text: "Q" },
      pillarName: "Military Affairs",
      inheritedNotes: [note({ evidentiaryStatus: "hunch" })],
    });
    expect(draft.whyNow).toBe("");
  });
});

describe("pitchHandoffUrl", () => {
  it("targets Editorial Planning's own new-pitch screen with the expected field keys", () => {
    const url = pitchHandoffUrl({
      title: "A title",
      centralQuestion: "A central question",
      primaryPillar: "Military Affairs",
      sourcesMaterials: "Some sources",
      whyNow: "Some why-now",
    });
    expect(url.startsWith("/editorial/pitches/new?")).toBe(true);
    const params = new URL(url, "https://example.com").searchParams;
    expect(params.get("title")).toBe("A title");
    expect(params.get("central_question")).toBe("A central question");
    expect(params.get("primary_pillar")).toBe("Military Affairs");
    expect(params.get("sources_materials")).toBe("Some sources");
    expect(params.get("why_now")).toBe("Some why-now");
  });

  it("omits sources_materials/why_now from the URL when there's nothing to carry forward", () => {
    const url = pitchHandoffUrl({
      title: "A title",
      centralQuestion: "A central question",
      primaryPillar: "Military Affairs",
      sourcesMaterials: "",
      whyNow: "",
    });
    const params = new URL(url, "https://example.com").searchParams;
    expect(params.has("sources_materials")).toBe(false);
    expect(params.has("why_now")).toBe(false);
  });
});
