import { describe, expect, it } from "vitest";
import { DRAFT_FRAMING } from "./piece-draft-prompt";
import { pieceAssistantInstructions } from "./piece-assistant-prompt";
import { PIECE_ASSISTANT_BUILT_IN, PIECE_DRAFT_BUILT_IN } from "./prompts";

const context = {
  pieceId: "4f27f92f-ad33-4c6c-a87d-0714bb0b9265",
  projectId: "b4d729cd-3a79-44a7-825d-841165f3ab9b",
  title: "Hurricane Isaias Update",
};

describe("pieceAssistantInstructions", () => {
  it("names the piece, and carries the editors' wording as given", () => {
    const text = pieceAssistantInstructions(context, "  Edit gently.\n");
    expect(text).toContain("“Hurricane Isaias Update”");
    expect(text).toContain(`pieceId ${context.pieceId}`);
    expect(text).toContain(`projectId ${context.projectId}`);
    expect(text).toContain("\n\nEdit gently.\n\n");
  });

  it("holds no editorial wording of its own: that is the slot's", () => {
    const text = pieceAssistantInstructions(context, "X");
    expect(text).not.toContain(PIECE_ASSISTANT_BUILT_IN);
    expect(text).not.toMatch(/attribut|short sentences|invent/i);
  });

  it("states the facts about the tools that hold whatever the wording says", () => {
    const text = pieceAssistantInstructions(context, "X");
    expect(text).toContain("excerpt id");
    expect(text).toContain("never your own estimate");
    expect(text).toContain("start over");
  });
});

describe("where the wording lives", () => {
  it("keeps the drafter's code-owned framing to mechanics", () => {
    expect(DRAFT_FRAMING).toContain("excerpt number");
    expect(DRAFT_FRAMING).not.toMatch(/attribut|short sentences|for the ear/i);
  });

  it("keeps the built-in wording short enough to read at a glance", () => {
    for (const body of [PIECE_DRAFT_BUILT_IN, PIECE_ASSISTANT_BUILT_IN]) {
      expect(body.split(/\s+/).length).toBeLessThan(260);
    }
  });
});
