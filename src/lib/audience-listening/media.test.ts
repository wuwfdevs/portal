import { describe, expect, it } from "vitest";
import {
  RECORDING_MIME_CANDIDATES,
  answerDownloadFilename,
  answerObjectPath,
  describeDuration,
  extensionForContentType,
  formatClock,
  isAllowedAnswerType,
  normalizeContentType,
} from "./media";

describe("normalizeContentType", () => {
  it("drops the codec parameters MediaRecorder adds", () => {
    expect(normalizeContentType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeContentType("audio/ogg; codecs=opus")).toBe("audio/ogg");
  });

  it("lowercases, so a browser shouting doesn't fail the bucket's exact match", () => {
    expect(normalizeContentType("AUDIO/MP4")).toBe("audio/mp4");
  });
});

describe("isAllowedAnswerType", () => {
  it("accepts every container a browser can actually produce here", () => {
    // Chrome/Firefox, Safari, and the Firefox Ogg fallback.
    expect(isAllowedAnswerType("audio/webm;codecs=opus")).toBe(true);
    expect(isAllowedAnswerType("audio/mp4")).toBe(true);
    expect(isAllowedAnswerType("audio/ogg;codecs=opus")).toBe(true);
  });

  it("rejects anything else, including video", () => {
    expect(isAllowedAnswerType("video/webm")).toBe(false);
    expect(isAllowedAnswerType("application/octet-stream")).toBe(false);
    expect(isAllowedAnswerType("")).toBe(false);
  });

  it("covers every candidate the recorder is allowed to pick", () => {
    for (const candidate of RECORDING_MIME_CANDIDATES) {
      expect(isAllowedAnswerType(candidate)).toBe(true);
    }
  });
});

describe("extensionForContentType", () => {
  it("maps the containers used here", () => {
    expect(extensionForContentType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForContentType("audio/mp4")).toBe("m4a");
    expect(extensionForContentType("audio/ogg")).toBe("ogg");
  });

  it("falls back rather than throwing on something unexpected", () => {
    expect(extensionForContentType("audio/flac")).toBe("bin");
  });
});

describe("answerObjectPath", () => {
  it("is extension-less, so a redo overwrites in place", () => {
    expect(answerObjectPath("q1", "s1", "a1")).toBe("q1/s1/a1");
  });

  it("nests under the submission, which is what the storage policy keys on", () => {
    // private.al_owns_open_submission_object matches "<query>/<submission>/%".
    expect(answerObjectPath("q1", "s1", "a1").startsWith("q1/s1/")).toBe(true);
  });
});

describe("answerDownloadFilename", () => {
  it("uses the participant's name when there is one to use", () => {
    expect(
      answerDownloadFilename({
        questionPosition: 2,
        participantLabel: "María Lopez",
        contentType: "audio/webm",
      }),
    ).toBe("q2-mar-a-lopez.webm");
  });

  it("falls back to the position alone when the name is withheld", () => {
    expect(
      answerDownloadFilename({
        questionPosition: 1,
        participantLabel: null,
        contentType: "audio/mp4",
      }),
    ).toBe("q1.m4a");
  });
});

describe("formatClock", () => {
  it("reads as a stopwatch", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("never shows a negative time", () => {
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("describeDuration", () => {
  it("reads as prose", () => {
    expect(describeDuration(45)).toBe("45 seconds");
    expect(describeDuration(60)).toBe("1 minute");
    expect(describeDuration(120)).toBe("2 minutes");
    expect(describeDuration(90)).toBe("1.5 minutes");
  });
});
