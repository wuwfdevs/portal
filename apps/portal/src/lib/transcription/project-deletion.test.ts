import { describe, expect, it } from "vitest";
import { deletionConfirmLabel, describeProjectDeletion, previewList } from "./project-deletion";

const source = (id: string, usedElsewhere: boolean, excerptCount = 0) => ({
  id,
  title: id,
  kind: "audio_video" as const,
  excerptCount,
  usedElsewhere,
});

describe("describeProjectDeletion", () => {
  it("removes sources only this project uses and keeps shared ones", () => {
    const plan = describeProjectDeletion([
      source("a", false, 4),
      source("b", true, 3),
      source("c", false, 1),
    ]);
    expect(plan.removed.map((s) => s.id)).toEqual(["a", "c"]);
    expect(plan.kept.map((s) => s.id)).toEqual(["b"]);
    expect(plan.removedExcerpts).toBe(5);
  });

  it("handles a project with no sources", () => {
    expect(describeProjectDeletion([])).toEqual({ removed: [], kept: [], removedExcerpts: 0 });
  });
});

describe("previewList", () => {
  it("shows the first few and counts the rest", () => {
    expect(previewList([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ shown: [1, 2, 3, 4, 5], more: 2 });
    expect(previewList([1, 2], 5)).toEqual({ shown: [1, 2], more: 0 });
  });
});

describe("deletionConfirmLabel", () => {
  it("says how many sources go", () => {
    const one = describeProjectDeletion([source("a", false)]);
    const many = describeProjectDeletion([source("a", false), source("b", false)]);
    const none = describeProjectDeletion([source("a", true)]);
    expect(deletionConfirmLabel(one)).toBe("Delete project and 1 source");
    expect(deletionConfirmLabel(many)).toBe("Delete project and 2 sources");
    expect(deletionConfirmLabel(none)).toBe("Delete project");
  });
});
