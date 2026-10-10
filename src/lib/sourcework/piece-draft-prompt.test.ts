import { describe, expect, it } from "vitest";
import { buildDraftInput, buildDraftOutputSchema, parseDraftOutput } from "./piece-draft-prompt";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

describe("buildDraftInput", () => {
  it("lists the accepted material, never more", () => {
    const text = buildDraftInput({
      projectTitle: "Fort Barrancas oral histories",
      direction: "Open on the gap in the fence.",
      targetSeconds: 60,
      themes: [
        {
          number: 1,
          title: "Locals treated the tunnels as a playground",
          definition: "Neighborhood children explored the fort's tunnels.",
          points: [
            {
              claim: "As a child he followed a tunnel with one flashlight.",
              stance: "supports",
              speaker: "Tom Reyes",
              sourceTitle: "Tom Reyes, interview",
            },
          ],
        },
      ],
      excerpts: [
        {
          number: 1,
          id: A,
          title: "One flashlight",
          speaker: "Tom Reyes",
          sourceTitle: "Tom Reyes, interview",
          seconds: 9,
          words: "It was pitch black.",
          themeNumbers: [1],
        },
      ],
    });
    expect(text).toContain("Direction from the reporter:\nOpen on the gap in the fence.");
    expect(text).toContain("Theme 1: Locals treated the tunnels as a playground.");
    expect(text).toContain(
      "(supports) As a child he followed a tunnel with one flashlight. [Tom Reyes, Tom Reyes, interview]",
    );
    expect(text).toContain("Excerpt 1 · 0:09 · Tom Reyes · Tom Reyes, interview · theme 1");
    expect(text).toContain("“It was pitch black.”");
    expect(text).toContain("Target length: 1:00.");
    expect(text).not.toContain(A);
  });

  it("says when there are no themes or no excerpts", () => {
    const text = buildDraftInput({
      projectTitle: "P",
      direction: "",
      targetSeconds: 45,
      themes: [],
      excerpts: [],
    });
    expect(text).toContain("None given.");
    expect(text).toContain("Work from the excerpts alone.");
    expect(text).toContain("write narration only");
  });
});

describe("buildDraftOutputSchema", () => {
  it("is strict: every block property is required", () => {
    const schema = buildDraftOutputSchema() as {
      properties: { blocks: { items: { required: string[]; additionalProperties: boolean } } };
    };
    expect(schema.properties.blocks.items.required).toEqual(["kind", "text", "excerpt_number"]);
    expect(schema.properties.blocks.items.additionalProperties).toBe(false);
  });
});

describe("parseDraftOutput", () => {
  const excerpts = [
    { number: 1, id: A },
    { number: 2, id: B },
  ];

  it("maps excerpt numbers to ids and keeps narration", () => {
    const result = parseDraftOutput(
      JSON.stringify({
        blocks: [
          { kind: "narration", text: " At Fort  Barrancas, a gap. ", excerpt_number: 0 },
          { kind: "actuality", text: "", excerpt_number: 2 },
          { kind: "narration", text: "[REPORTER NAME], WUWF News.", excerpt_number: 0 },
        ],
      }),
      excerpts,
      ids(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks.map((block) => block.type)).toEqual([
      "narration",
      "actuality",
      "narration",
    ]);
    expect(result.blocks[0]).toMatchObject({ text: "At Fort Barrancas, a gap." });
    expect(result.blocks[1]).toMatchObject({ excerpt_id: B });
    expect(result.warnings).toEqual([]);
  });

  it("drops an excerpt it was not shown, and a repeat, with a warning", () => {
    const result = parseDraftOutput(
      JSON.stringify({
        blocks: [
          { kind: "narration", text: "Lead.", excerpt_number: 0 },
          { kind: "actuality", text: "", excerpt_number: 7 },
          { kind: "actuality", text: "", excerpt_number: 1 },
          { kind: "actuality", text: "", excerpt_number: 1 },
          { kind: "narration", text: "  ", excerpt_number: 0 },
        ],
      }),
      excerpts,
      ids(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks).toHaveLength(2);
    expect(result.warnings).toHaveLength(2);
  });

  it("fails on unreadable output or a draft with no narration", () => {
    expect(parseDraftOutput("not json", excerpts, ids()).ok).toBe(false);
    expect(
      parseDraftOutput(
        JSON.stringify({ blocks: [{ kind: "actuality", text: "", excerpt_number: 1 }] }),
        excerpts,
        ids(),
      ).ok,
    ).toBe(false);
  });
});

describe("anchor intro in a draft", () => {
  const excerpts = [{ number: 1, id: "e1" }];
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  it("keeps a first anchor intro as an anchor block", () => {
    const text = JSON.stringify({
      blocks: [
        { kind: "anchor_intro", text: "A host reads this.", excerpt_number: 0 },
        { kind: "narration", text: "The reporter reads this.", excerpt_number: 0 },
      ],
    });
    const parsed = parseDraftOutput(text, excerpts, newId);
    expect(parsed.ok && parsed.blocks[0]).toMatchObject({ type: "narration", role: "anchor" });
  });

  it("demotes a later one to narration with a warning, and needs real narration", () => {
    const later = JSON.stringify({
      blocks: [
        { kind: "narration", text: "Reporter.", excerpt_number: 0 },
        { kind: "anchor_intro", text: "Late intro.", excerpt_number: 0 },
      ],
    });
    const parsed = parseDraftOutput(later, excerpts, newId);
    expect(parsed.ok && parsed.blocks[1]).not.toHaveProperty("role");
    expect(parsed.ok && parsed.warnings).toHaveLength(1);
    const only = JSON.stringify({
      blocks: [{ kind: "anchor_intro", text: "Only.", excerpt_number: 0 }],
    });
    expect(parseDraftOutput(only, excerpts, newId).ok).toBe(false);
  });
});
