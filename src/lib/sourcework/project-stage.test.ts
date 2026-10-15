import { describe, expect, it } from "vitest";
import {
  hasNextStep,
  PROJECT_STEPS,
  projectProgress,
  nextStepHeadline,
  projectStage,
  type ProjectStageInput,
} from "./project-stage";

const base: ProjectStageInput = {
  sourceCount: 6,
  readyCount: 6,
  analyzedCount: 5,
  waitingReview: 14,
  acceptedFindings: 12,
  hasSynthesis: false,
  pieceCount: 0,
};

describe("projectStage", () => {
  it("starts at Sources for an empty project", () => {
    expect(projectStage({ ...base, sourceCount: 0, readyCount: 0, analyzedCount: 0 })).toEqual({
      current: 0,
      next: { kind: "add_sources" },
    });
  });

  it("waits while nothing has finished processing", () => {
    const stage = projectStage({ ...base, readyCount: 0, analyzedCount: 0 });
    expect(stage.current).toBe(0);
    expect(stage.next.kind).toBe("wait_for_sources");
  });

  it("points at Analyze until one source has been analyzed", () => {
    const stage = projectStage({ ...base, analyzedCount: 0, waitingReview: 0 });
    expect(stage.current).toBe(1);
    expect(stage.next).toEqual({ kind: "analyze", unanalyzed: 6 });
  });

  it("treats Analyze as done once one source is analyzed, even with others left", () => {
    const stage = projectStage(base);
    expect(stage.current).toBe(2);
    expect(stage.next).toEqual({ kind: "review", waiting: 14 });
  });

  it("moves to Synthesis when nothing waits and findings are accepted", () => {
    const stage = projectStage({ ...base, waitingReview: 0 });
    expect(stage.current).toBe(3);
    expect(stage.next).toEqual({ kind: "synthesize", accepted: 12 });
  });

  it("asks for an accepted finding first when there is none", () => {
    const stage = projectStage({ ...base, waitingReview: 0, acceptedFindings: 0 });
    expect(stage.next.kind).toBe("accept_first");
  });

  it("points at starting a piece once a synthesis exists", () => {
    const stage = projectStage({ ...base, waitingReview: 0, hasSynthesis: true });
    expect(stage.current).toBe(4);
    expect(stage.next.kind).toBe("start_piece");
  });

  it("marks every step done once a piece exists", () => {
    const stage = projectStage({ ...base, waitingReview: 0, hasSynthesis: true, pieceCount: 2 });
    expect(stage.current).toBe(PROJECT_STEPS.length);
    expect(stage.next).toEqual({ kind: "continue_piece", pieces: 2 });
  });
});

describe("hasNextStep", () => {
  it("is false only once a project has reached its pieces", () => {
    expect(hasNextStep({ kind: "continue_piece", pieces: 1 })).toBe(false);
    expect(hasNextStep({ kind: "start_piece" })).toBe(true);
    expect(hasNextStep({ kind: "analyze", unanalyzed: 3 })).toBe(true);
  });
});

describe("nextStepHeadline", () => {
  it("agrees in number", () => {
    expect(nextStepHeadline({ kind: "review", waiting: 1 })).toMatch(/^1 finding or clip is/);
    expect(nextStepHeadline({ kind: "review", waiting: 14 })).toMatch(/^14 findings and clips are/);
  });
});

describe("projectProgress", () => {
  it("counts finished steps and names the one under way", () => {
    expect(projectProgress(base)).toEqual({
      done: 2,
      inProgress: 1,
      total: 5,
      complete: false,
      label: "Review",
    });
  });
  it("says so for an empty project and one still processing", () => {
    expect(
      projectProgress({ ...base, sourceCount: 0, readyCount: 0, analyzedCount: 0 }),
    ).toMatchObject({
      done: 0,
      inProgress: 0,
      label: "No sources",
    });
    expect(projectProgress({ ...base, readyCount: 0, analyzedCount: 0 })).toMatchObject({
      done: 0,
      inProgress: 1,
      label: "Processing",
    });
  });
  it("is complete once a piece exists", () => {
    expect(
      projectProgress({ ...base, waitingReview: 0, hasSynthesis: true, pieceCount: 1 }),
    ).toMatchObject({ done: 5, inProgress: 0, complete: true, label: "Piece started" });
  });
});
