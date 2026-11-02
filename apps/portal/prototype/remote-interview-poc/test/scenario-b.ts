/**
 * Task 7, Scenario B: reload right after recording stops, before all uploads
 * have acked — modeling a tab crash/refresh in the window the design doc's
 * completion screen exists for ("your recording is still uploading, keep
 * this tab open"). A server-side response delay (triggered via a query
 * param this test adds through Playwright's route interception) means some
 * PUTs have already durably written their file when the reload aborts the
 * client's in-flight fetch — so the client never sees the ack, exercising
 * both OPFS durability across navigation AND the server's idempotent
 * dedupe (the resume-drain will re-PUT a sequence the server already has).
 *
 * Pass criteria (from the plan file), all must hold:
 *   - Immediately after reload, OPFS still holds file(s) that were
 *     unacked at reload time (durability across navigation).
 *   - The resume/drain logic empties OPFS without manual intervention.
 *   - The final assembled duration matches Scenario A's (same ~25s
 *     recording) within the same ~250ms tolerance — proving the reload
 *     neither lost audio (evicted before flush) nor duplicated it
 *     (idempotency failing to dedupe a resend).
 */
import path from "node:path";
import { withHarness } from "./harness.ts";

async function pollUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 250): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function main(): Promise<void> {
  const tonePath = path.resolve(import.meta.dirname, "tone.wav");
  const trackId = `scenario-b-${Date.now()}`;
  let pass = true;

  await withHarness(async ({ page }) => {
    // Delay every part PUT's response by 8s, but only while `delayEnabled`
    // is true — turned off right after reload so the resume-drain itself
    // isn't artificially slowed (we're testing recovery, not patience).
    let delayEnabled = true;
    await page.route("**/api/tracks/**/parts/**", async (route) => {
      if (delayEnabled) {
        const url = new URL(route.request().url());
        url.searchParams.set("delayMs", "8000");
        await route.continue({ url: url.toString() });
      } else {
        await route.continue();
      }
    });

    console.log(`[B] recording track ${trackId} for ~25s (uploads deliberately delayed)...`);
    await page.evaluate((id) => window.__poc.startCapture(id), trackId);
    await page.waitForTimeout(25_000);
    const { elapsedMs, chunkCount } = await page.evaluate(() => window.__poc.stopCapture());
    console.log(`[B] stopped: client-measured elapsed=${elapsedMs.toFixed(0)}ms chunkCount=${chunkCount}`);

    // Reload immediately — before waiting for any acks. Because responses
    // are delayed 8s, at least the most recent chunk(s) should still be
    // "written server-side, response not yet seen by client" at this point.
    console.log("[B] reloading now, before uploads have acked...");
    await page.reload();
    await page.waitForFunction(() => "__poc" in window);

    // Capture OPFS state as early as possible post-reload, before the boot
    // resume/drain logic (which fires automatically on page load) has had
    // time to finish draining everything.
    const filesImmediatelyAfterReload = await page.evaluate((id) => window.__poc.listOpfsFiles(id), trackId);
    console.log(`[B] OPFS files immediately after reload: ${JSON.stringify(filesImmediatelyAfterReload)}`);
    const durabilityOk = filesImmediatelyAfterReload.length > 0;
    if (!durabilityOk) {
      console.error(
        "[B] FAIL: OPFS was already empty immediately after reload — either everything acked before " +
          "reload (delay didn't take effect) or OPFS did not survive navigation. Cannot confirm durability.",
      );
      pass = false;
    }

    // Now let the drain proceed at full speed.
    delayEnabled = false;

    const drained = await pollUntil(
      async () => (await page.evaluate((id) => window.__poc.listOpfsFiles(id), trackId)).length === 0,
      20_000,
    );
    const filesAfterDrain = await page.evaluate((id) => window.__poc.listOpfsFiles(id), trackId);
    console.log(`[B] OPFS files after drain: ${JSON.stringify(filesAfterDrain)} (drained=${drained})`);
    if (!drained) {
      console.error("[B] FAIL: resume-drain did not empty OPFS within 20s");
      pass = false;
    }

    const statusRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/status`);
      return r.json();
    }, trackId);
    console.log(`[B] server status: ${JSON.stringify(statusRes)}`);
    if (statusRes.count !== chunkCount) {
      console.error(`[B] FAIL: server has ${statusRes.count} parts, expected ${chunkCount}`);
      pass = false;
    }

    const assembleRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/assemble`, { method: "POST" });
      return { status: r.status, body: await r.json() };
    }, trackId);
    console.log(`[B] assemble response: ${JSON.stringify(assembleRes)}`);
    if (assembleRes.status !== 200 || !assembleRes.body.ok) {
      console.error("[B] FAIL: assembly did not succeed");
      pass = false;
      return;
    }

    const verifyRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/verify`);
      return { status: r.status, body: await r.json() };
    }, trackId);
    console.log(`[B] verify response: ${JSON.stringify(verifyRes)}`);
    if (verifyRes.status !== 200 || !verifyRes.body.ok) {
      console.error("[B] FAIL: verify did not succeed");
      pass = false;
      return;
    }

    const report = verifyRes.body;
    const durationDeltaMs = Math.abs(report.durationMs - elapsedMs);
    const durationOk = durationDeltaMs <= 250;
    const volumeOk = report.meanVolumeDb !== null && report.meanVolumeDb > -60;

    console.log(
      `[B] durationMs=${report.durationMs} (delta from Scenario-B's own client-measured elapsed=${durationDeltaMs.toFixed(0)}ms, ok=${durationOk}); ` +
        `meanVolumeDb=${report.meanVolumeDb} (ok=${volumeOk})`,
    );

    if (!durationOk) {
      console.error(
        `[B] FAIL: assembled duration delta ${durationDeltaMs.toFixed(0)}ms exceeds 250ms — ` +
          "audio was likely lost or duplicated across the reload",
      );
      pass = false;
    }
    if (!volumeOk) {
      console.error(`[B] FAIL: mean volume ${report.meanVolumeDb}dB at/below silence threshold`);
      pass = false;
    }

    console.log(`[B] assembled file: ${assembleRes.body.path}`);
  }, { fakeAudioFile: tonePath });

  console.log(pass ? "PASS: Scenario B" : "FAIL: Scenario B");
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
