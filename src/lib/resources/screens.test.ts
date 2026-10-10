import { describe, expect, it } from "vitest";
import { SCREENS, helpContextForPath } from "./screens";

describe("helpContextForPath", () => {
  it("names the tool and screen for a tool's pages", () => {
    expect(helpContextForPath("/sourcework")).toEqual({
      toolKey: "transcription",
      screenKey: "sourcework.projects",
    });
    expect(helpContextForPath("/sourcework/0b6c3a52")).toEqual({
      toolKey: "transcription",
      screenKey: "sourcework.project",
    });
    expect(helpContextForPath("/log/programs/abc/schedule/new")?.screenKey).toBe(
      "log.program.schedule",
    );
    expect(helpContextForPath("/underwriting/contracts/abc/lines/def/place")?.screenKey).toBe(
      "underwriting.contract",
    );
  });

  it("prefers a literal segment over a parameter, and a query over none", () => {
    expect(helpContextForPath("/sourcework/new")?.screenKey).toBe("sourcework.projects");
    expect(helpContextForPath("/sourcework/sources/abc")?.screenKey).toBe("sourcework.source");
    expect(helpContextForPath("/sourcework", "?tab=sources")?.screenKey).toBe("sourcework.sources");
    expect(helpContextForPath("/sourcework", "?tab=clips")?.screenKey).toBe("sourcework.projects");
    expect(helpContextForPath("/academic-partnerships/settings")?.screenKey).toBe(
      "academic-partnerships.settings",
    );
    expect(helpContextForPath("/academic-partnerships/abc")?.screenKey).toBe(
      "academic-partnerships.submission",
    );
  });

  it("finds a project's Themes tab and a theme's page", () => {
    expect(helpContextForPath("/sourcework/0b6c3a52", "?view=themes")?.screenKey).toBe(
      "sourcework.themes",
    );
    expect(helpContextForPath("/sourcework/0b6c3a52/themes/9f1")?.screenKey).toBe(
      "sourcework.theme",
    );
    expect(helpContextForPath("/sourcework/0b6c3a52/themes/9f1/quotes")?.screenKey).toBe(
      "sourcework.theme_quotes",
    );
  });

  it("tells Editorial Inquiry apart from Editorial Planning", () => {
    expect(helpContextForPath("/editorial-inquiry")?.toolKey).toBe("editorial-inquiry");
    expect(helpContextForPath("/editorial")?.toolKey).toBe("editorial-planning");
  });

  it("opens on the tool with no screen for a page no screen covers", () => {
    expect(helpContextForPath("/underwriting/underwriters")).toEqual({
      toolKey: "underwriting",
      screenKey: null,
    });
    expect(helpContextForPath("/log/weather")).toEqual({ toolKey: "log", screenKey: null });
  });

  it("finds the Sources screen for the overview and each source's page", () => {
    expect(helpContextForPath("/log/sources")).toEqual({
      toolKey: "log",
      screenKey: "log.sources",
    });
    expect(helpContextForPath("/log/sources/npr")).toEqual({
      toolKey: "log",
      screenKey: "log.sources",
    });
  });

  it("is null outside any tool", () => {
    expect(helpContextForPath("/dashboard")).toBeNull();
    expect(helpContextForPath("/admin/users")).toBeNull();
    expect(helpContextForPath("/resources/whats-new")).toBeNull();
    expect(helpContextForPath("/")).toBeNull();
  });

  it("gives every screen a route of its own tool", () => {
    for (const screen of SCREENS) {
      for (const path of screen.paths) {
        const [pathname = "", query = ""] = path.split("?");
        const concrete = pathname.replace(/:[A-Za-z]+/g, "x0");
        expect(helpContextForPath(concrete, query ? `?${query}` : "")).toEqual({
          toolKey: screen.toolKey,
          screenKey: screen.key,
        });
      }
    }
  });
});
