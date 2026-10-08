import { describe, expect, it } from "vitest";
import { projectPath, sourcePath } from "./links";

describe("projectPath", () => {
  it("is the bare project, or its excerpts view", () => {
    expect(projectPath("p1")).toBe("/sourcework/p1");
    expect(projectPath("p1", "excerpts")).toBe("/sourcework/p1?view=excerpts");
  });
});

describe("sourcePath", () => {
  it("is the bare source with no context", () => {
    expect(sourcePath("s1")).toBe("/sourcework/sources/s1");
  });

  it("carries the project it was reached from", () => {
    expect(sourcePath("s1", { projectId: "p1" })).toBe("/sourcework/sources/s1?project=p1");
  });

  it("seeks an audio hit and marks its excerpt", () => {
    expect(sourcePath("s1", { projectId: "p1", t: 12000, clip: "c1" })).toBe(
      "/sourcework/sources/s1?project=p1&t=12000&clip=c1",
    );
  });

  it("keeps a time of zero rather than dropping it", () => {
    expect(sourcePath("s1", { t: 0 })).toBe("/sourcework/sources/s1?t=0");
  });

  it("opens a document hit on its page, but never both a time and a page", () => {
    expect(sourcePath("s1", { page: 4 })).toBe("/sourcework/sources/s1?page=4");
    expect(sourcePath("s1", { t: 5, page: 4 })).toBe("/sourcework/sources/s1?t=5");
  });
});
