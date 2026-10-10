import { describe, expect, it } from "vitest";
import {
  buildExcerptExportFilename,
  buildClipsZipFilename,
  buildTranscriptExportFilename,
  excerptExportObjectPath,
  extensionForContentType,
  formatBytes,
  formatDuration,
  isAllowedDocumentType,
  isAllowedMediaType,
  isDocumentContentType,
  isVideoContentType,
  sourceObjectPath,
  titleFromFileName,
  classifySourceFile,
  resolveSourceContentType,
} from "./media";

describe("isAllowedMediaType", () => {
  it("accepts browser-playable audio and video formats", () => {
    expect(isAllowedMediaType("audio/wav")).toBe(true);
    expect(isAllowedMediaType("video/mp4")).toBe(true);
  });

  it("rejects formats outside the upload allow-list", () => {
    expect(isAllowedMediaType("application/octet-stream")).toBe(false);
    expect(isAllowedMediaType("video/x-msvideo")).toBe(false);
  });

  it("rejects PDF — that's a document upload, not a media one", () => {
    expect(isAllowedMediaType("application/pdf")).toBe(false);
  });
});

describe("isAllowedDocumentType", () => {
  it("accepts PDF", () => {
    expect(isAllowedDocumentType("application/pdf")).toBe(true);
  });

  it("rejects audio/video types — that's a media upload, not a document one", () => {
    expect(isAllowedDocumentType("audio/wav")).toBe(false);
  });
});

describe("extensionForContentType", () => {
  it("maps known content types to their extension", () => {
    expect(extensionForContentType("audio/mpeg")).toBe("mp3");
    expect(extensionForContentType("video/quicktime")).toBe("mov");
    expect(extensionForContentType("application/pdf")).toBe("pdf");
  });

  it("falls back to a generic extension for unknown types", () => {
    expect(extensionForContentType("application/octet-stream")).toBe("bin");
  });
});

describe("isVideoContentType", () => {
  it("distinguishes video from audio content types", () => {
    expect(isVideoContentType("video/mp4")).toBe(true);
    expect(isVideoContentType("audio/wav")).toBe(false);
  });
});

describe("isDocumentContentType", () => {
  it("recognizes PDF and nothing else", () => {
    expect(isDocumentContentType("application/pdf")).toBe(true);
    expect(isDocumentContentType("audio/wav")).toBe(false);
  });
});

describe("sourceObjectPath", () => {
  it("places a source's file at <source id>/source.<ext>", () => {
    expect(sourceObjectPath("abc-123", "audio/wav")).toBe("abc-123/source.wav");
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB, MB, and GB with reasonable precision", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2.3 * 1024 * 1024 * 1024)).toBe("2.3 GB");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as m:ss", () => {
    expect(formatDuration(65_000)).toBe("1:05");
    expect(formatDuration(9_000)).toBe("0:09");
  });

  it("formats hour-plus durations as h:mm:ss", () => {
    expect(formatDuration(3_661_000)).toBe("1:01:01");
  });
});

describe("excerptExportObjectPath", () => {
  it("places a clip export at <source id>/excerpts/<excerpt id>.wav", () => {
    expect(excerptExportObjectPath("src-1", "clip-2")).toBe("src-1/excerpts/clip-2.wav");
  });
});

describe("filename slugs", () => {
  it("lowercases and hyphenates", () => {
    expect(buildTranscriptExportFilename("2026-07-22", "Mayor Reeves on Bridge Funding")).toBe(
      "2026-07-22_mayor-reeves-on-bridge-funding_transcript.txt",
    );
  });

  it("strips punctuation and collapses repeated separators", () => {
    expect(buildClipsZipFilename("2026-07-22", 'Reeves: "We\'ll fund it!"')).toBe(
      "2026-07-22_reeves-we-ll-fund-it_clips.zip",
    );
  });

  it("falls back to a placeholder for a title with no alphanumeric characters", () => {
    expect(buildClipsZipFilename("2026-07-22", "***")).toBe("2026-07-22_untitled_clips.zip");
  });

  it("folds accents and reads & as 'and' (the shared slugify)", () => {
    expect(buildClipsZipFilename("2026-07-22", "Café R&D")).toBe(
      "2026-07-22_cafe-r-and-d_clips.zip",
    );
  });

  it("caps a long title at 60 characters", () => {
    const name = buildClipsZipFilename("2026-07-22", "a".repeat(100));
    expect(name).toBe(`2026-07-22_${"a".repeat(60)}_clips.zip`);
  });
});

describe("buildExcerptExportFilename", () => {
  it("names the story, the speaker and a short id for the quote", () => {
    expect(
      buildExcerptExportFilename(
        "Hurricane Isaias",
        "Chip Simmons",
        "Generator fumes nearly killed",
      ),
    ).toBe("hurricane-isaias_chip-simmons_generator-fumes-nearly-killed.wav");
  });

  it("cuts a long quote title at a word, not mid-word", () => {
    const name = buildExcerptExportFilename(
      "Isaias",
      "Chip Simmons",
      "We found another generator running unsafely in a closed garage two streets over",
    );
    expect(name).toBe("isaias_chip-simmons_we-found-another-generator-running.wav");
  });

  it("falls back when there is no speaker or title", () => {
    expect(buildExcerptExportFilename("Isaias", null, "")).toBe("isaias_unnamed_excerpt.wav");
    expect(buildExcerptExportFilename("", "Speaker A", "Bridge funding")).toBe(
      "untitled_speaker-a_bridge-funding.wav",
    );
  });
});

describe("buildTranscriptExportFilename", () => {
  it("names the transcript after the project and date", () => {
    expect(buildTranscriptExportFilename("2026-07-22", "Reeves interview")).toBe(
      "2026-07-22_reeves-interview_transcript.txt",
    );
  });
});

describe("buildClipsZipFilename", () => {
  it("names the archive after the project and date", () => {
    expect(buildClipsZipFilename("2026-07-22T14:03:00.000Z", "Reeves interview")).toBe(
      "2026-07-22_reeves-interview_clips.zip",
    );
  });
});

describe("titleFromFileName", () => {
  it("drops the extension", () => {
    expect(titleFromFileName("Reeves interview.wav")).toBe("Reeves interview");
    expect(titleFromFileName("2026 budget packet.pdf")).toBe("2026 budget packet");
  });

  it("reads underscores as spaces and collapses runs of whitespace", () => {
    expect(titleFromFileName("reeves_interview__part2.mp3")).toBe("reeves interview part2");
  });

  it("leaves a name that already reads like a title alone", () => {
    expect(titleFromFileName("Reeves interview, 3-14.wav")).toBe("Reeves interview, 3-14");
  });

  it("drops only the final extension", () => {
    expect(titleFromFileName("budget.final.pdf")).toBe("budget.final");
  });

  it("keeps a name with no extension at all", () => {
    expect(titleFromFileName("county commission")).toBe("county commission");
  });

  it("returns an empty string when nothing is left to use as a title", () => {
    expect(titleFromFileName(".pdf")).toBe("");
    expect(titleFromFileName("   ")).toBe("");
  });
});

describe("classifySourceFile", () => {
  it("sorts a file into audio/video or document", () => {
    expect(classifySourceFile({ name: "a.mp3", type: "audio/mpeg" })).toEqual({
      kind: "audio_video",
      contentType: "audio/mpeg",
    });
    expect(classifySourceFile({ name: "a.mp4", type: "video/mp4" })).toEqual({
      kind: "audio_video",
      contentType: "video/mp4",
    });
    expect(classifySourceFile({ name: "a.pdf", type: "application/pdf" })).toEqual({
      kind: "document",
      contentType: "application/pdf",
    });
  });

  it("refuses anything else with a sentence the reporter can act on", () => {
    const result = classifySourceFile({ name: "a.png", type: "image/png" });
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("PDF");
  });
});

describe("resolveSourceContentType", () => {
  it("keeps a type the allow-list knows", () => {
    expect(resolveSourceContentType({ name: "x.m4a", type: "audio/x-m4a" })).toBe("audio/x-m4a");
  });

  it("maps the aliases browsers report for an iPhone Voice Memo", () => {
    expect(resolveSourceContentType({ name: "New Recording.m4a", type: "audio/m4a" })).toBe(
      "audio/mp4",
    );
    expect(resolveSourceContentType({ name: "x.m4a", type: "audio/mp4a-latm" })).toBe("audio/mp4");
  });

  it("falls back to the extension when the type is empty or unlisted", () => {
    expect(resolveSourceContentType({ name: "New Recording 4.M4A", type: "" })).toBe("audio/mp4");
    expect(resolveSourceContentType({ name: "clip.mov", type: "application/octet-stream" })).toBe(
      "video/quicktime",
    );
  });

  it("returns nothing for a file it can't identify", () => {
    expect(resolveSourceContentType({ name: "photo.png", type: "image/png" })).toBe("");
    expect(classifySourceFile({ name: "notes", type: "" })).toHaveProperty("error");
  });
});
