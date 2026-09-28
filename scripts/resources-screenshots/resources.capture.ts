// Captures every screenshot in ./shots.ts from a running portal and stores
// it for Resources guides: signs in as a seeded user, visits each shot's
// route at 1280×800, captures the element marked data-help-shot="<name>" (or
// the whole viewport if there is none), uploads it to the resources-media
// bucket at shots/<screen_key>/<name>.png, and upserts its rc_media row by
// (screen_key, name). Run with `npm run screenshots:resources`; README.md
// alongside has the environment it needs. It only ever *captures* from
// preview or a local instance — it refuses to sign in to the production
// project, so no real sources, guests, or donors appear in a guide — and it
// can also *publish* the same images to production when given that
// project's URL and secret key, since production's guides reference the
// same rows.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, type BrowserContext } from "playwright-core";
import type { Database } from "@/lib/database.types";
import { RESOURCES_MEDIA_BUCKET, pngSize, shotObjectPath } from "@/lib/resources/screenshot-rules";
import { SHOTS } from "./shots";

/** wuwf-tools-portal. The script never writes there. */
const PRODUCTION_PROJECT_REF = "bpmwfvjttypmsdjgqjgb";
const VIEWPORT = { width: 1280, height: 800 };

loadEnvLocal(path.resolve(__dirname, "../../.env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";
const baseUrl = (process.env.SCREENSHOTS_BASE_URL ?? "").replace(/\/$/, "");
const email = process.env.SCREENSHOTS_EMAIL ?? "";
const ready = Boolean(supabaseUrl && publishableKey && secretKey && baseUrl && email);
const productionUrl = process.env.SCREENSHOTS_PRODUCTION_SUPABASE_URL ?? "";
const productionSecretKey = process.env.SCREENSHOTS_PRODUCTION_SECRET_KEY ?? "";

describe.skipIf(!ready)("Resources screenshots", () => {
  if (!ready) {
    console.warn(
      "Skipping: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SCREENSHOTS_BASE_URL and SCREENSHOTS_EMAIL (see README.md).",
    );
  }

  it("refuses the production project", () => {
    expect(supabaseUrl).not.toContain(PRODUCTION_PROJECT_REF);
  });

  it("captures every shot", async () => {
    if (supabaseUrl.includes(PRODUCTION_PROJECT_REF))
      throw new Error("Refusing to run against production.");
    const admin = createClient<Database>(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Where each capture is stored: always the database it was captured
    // from, and production too when its credentials are given.
    const targets = [{ label: "capture source", client: admin }];
    if (productionUrl && productionSecretKey) {
      targets.push({
        label: "production",
        client: createClient<Database>(productionUrl, productionSecretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      });
    }

    const browser = await chromium.launch(
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {},
    );
    try {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      await signIn(context);
      const page = await context.newPage();

      for (const shot of SHOTS) {
        const route = await shot.path(admin);
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        if (new URL(page.url()).pathname.startsWith("/login")) {
          throw new Error(`Signed out while visiting ${route} — check SCREENSHOTS_EMAIL.`);
        }
        const marked = page.locator(`[data-help-shot="${shot.name}"]`);
        const bytes =
          (await marked.count()) > 0 ? await marked.first().screenshot() : await page.screenshot();
        const size = pngSize(bytes);
        if (!size) throw new Error(`${shot.name}: the capture wasn't a PNG.`);

        const objectPath = shotObjectPath(shot.screenKey, shot.name);
        for (const target of targets) {
          const { error: uploadError } = await target.client.storage
            .from(RESOURCES_MEDIA_BUCKET)
            .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
          if (uploadError) {
            throw new Error(
              `${shot.name} (${target.label}): upload failed: ${uploadError.message}`,
            );
          }
          await upsertMediaRow(target.client, {
            screen_key: shot.screenKey,
            name: shot.name,
            object_path: objectPath,
            alt: shot.alt,
            width: size.width,
            height: size.height,
          });
        }
        console.log(
          `Captured ${shot.screenKey}/${shot.name} (${size.width}×${size.height}) from ${route} → ${targets.map((target) => target.label).join(", ")}`,
        );
      }
    } finally {
      await browser.close();
    }
  });
});

/**
 * Magic-link sign-in without an inbox: the secret key mints the link's
 * token, a server-style client verifies it into session cookies, and those
 * cookies go into the browser — the same cookies /auth/callback would set.
 */
async function signIn(context: BrowserContext): Promise<void> {
  const admin = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not mint a sign-in link for ${email}: ${error?.message ?? "no token"}`);
  }

  const jar = new Map<string, string>();
  const client = createServerClient<Database>(supabaseUrl, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: verifyError } = await client.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) throw new Error(`Could not sign in as ${email}: ${verifyError.message}`);

  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, url: baseUrl, sameSite: "Lax" as const })),
  );
}

async function upsertMediaRow(
  admin: ReturnType<typeof createClient<Database>>,
  row: {
    screen_key: string;
    name: string;
    object_path: string;
    alt: string;
    width: number;
    height: number;
  },
): Promise<void> {
  const capturedAt = new Date().toISOString();
  const { data: existing, error: readError } = await admin
    .from("rc_media")
    .select("id")
    .eq("screen_key", row.screen_key)
    .eq("name", row.name)
    .maybeSingle();
  if (readError) throw new Error(`${row.name}: ${readError.message}`);

  // The row's id is what guide bodies reference, so an existing row is
  // updated in place, never replaced.
  const { error } = existing
    ? await admin
        .from("rc_media")
        .update({ ...row, captured_at: capturedAt })
        .eq("id", existing.id)
    : await admin.from("rc_media").insert({ ...row, source: "release", captured_at: capturedAt });
  if (error) throw new Error(`${row.name}: ${error.message}`);
}

function loadEnvLocal(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]!] !== undefined) continue;
    process.env[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
  }
}
