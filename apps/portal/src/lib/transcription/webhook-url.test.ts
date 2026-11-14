import { describe, expect, it } from "vitest";
import { transcriptionWebhookUrl } from "./webhook-url";

const SECRET = "bjs8lmoZABjskwLxmHTvqV4I1deKiOXh";

describe("transcriptionWebhookUrl", () => {
  it("is the plain webhook address everywhere but a protected preview", () => {
    expect(transcriptionWebhookUrl("https://tools.example.org", { VERCEL_ENV: "production", VERCEL_AUTOMATION_BYPASS_SECRET: SECRET })).toBe(
      "https://tools.example.org/api/transcription/webhook",
    );
    expect(transcriptionWebhookUrl("http://localhost:3000", {})).toBe("http://localhost:3000/api/transcription/webhook");
    expect(transcriptionWebhookUrl("https://portal-x-wuwf.vercel.app", { VERCEL_ENV: "preview" })).toBe("https://portal-x-wuwf.vercel.app/api/transcription/webhook");
  });

  it("carries the bypass secret on a preview deployment that has one", () => {
    expect(transcriptionWebhookUrl("https://portal-x-wuwf.vercel.app/", { VERCEL_ENV: "preview", VERCEL_AUTOMATION_BYPASS_SECRET: SECRET })).toBe(
      `https://portal-x-wuwf.vercel.app/api/transcription/webhook?x-vercel-protection-bypass=${SECRET}`,
    );
  });

  it("never puts anything that is not a plausible secret into the address", () => {
    for (const bad of ["", "  ", "short", "has space and is long enough here", "a&b=c-long-enough-secret-value"]) {
      expect(transcriptionWebhookUrl("https://p.example", { VERCEL_ENV: "preview", VERCEL_AUTOMATION_BYPASS_SECRET: bad })).toBe("https://p.example/api/transcription/webhook");
    }
  });
});
