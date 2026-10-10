import { describe, expect, it } from "vitest";
import { DRAFT_FRAMING } from "./piece-draft-prompt";
import { pieceAssistantInstructions } from "./piece-assistant-prompt";
import {
  PIECE_ACCURACY_RULES,
  PIECE_CLIP_RULES,
  PIECE_EAR_RULES,
  PIECE_EDITORIAL_RULES,
} from "./piece-editorial-rules";

const context = {
  pieceId: "4f27f92f-ad33-4c6c-a87d-0714bb0b9265",
  projectId: "b4d729cd-3a79-44a7-825d-841165f3ab9b",
  title: "Hurricane Isaias Update",
};

describe("pieceAssistantInstructions", () => {
  const text = pieceAssistantInstructions(context);

  it("names the piece it is working in", () => {
    expect(text).toContain("“Hurricane Isaias Update”");
    expect(text).toContain(`pieceId ${context.pieceId}`);
    expect(text).toContain(`projectId ${context.projectId}`);
  });

  it("holds the assistant to the same standards as the drafter", () => {
    expect(text).toContain(PIECE_EDITORIAL_RULES);
    expect(DRAFT_FRAMING).toContain(PIECE_ACCURACY_RULES);
    expect(DRAFT_FRAMING).toContain(PIECE_CLIP_RULES);
    expect(DRAFT_FRAMING).toContain(PIECE_EAR_RULES);
  });

  it("tells it to keep a clip and its lead-in together and to act on the checks", () => {
    expect(text).toMatch(/lead-in[^.]*belongs to that clip/);
    expect(text).toContain("checks");
    expect(text).toContain("the lead-ins and the close still agree");
  });

  it("does not let a rewrite add a claim", () => {
    expect(text).toContain("[CHECK: …]");
    expect(text).toContain("invented claim");
  });
});

describe("the shared rules", () => {
  it("name no excerpt numbers or ids, which belong to each prompt's own tools", () => {
    expect(PIECE_EDITORIAL_RULES).not.toMatch(/excerpt (number|id)/i);
  });

  it("ban the vague lead-ins the first draft used", () => {
    for (const verb of ["described", "put in context"]) {
      expect(PIECE_CLIP_RULES).toContain(verb);
    }
  });
});
