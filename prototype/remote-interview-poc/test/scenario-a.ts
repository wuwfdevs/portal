/**
 * Task 6, Scenario A (happy path): record -> upload -> assemble -> verify.
 * Concrete, numeric pass/fail criteria (docs/remote-interview-technical-
 * assessment.md's "principal technical risks" #1, and the plan file):
 *   - ffprobe/ffmpeg exit clean on master.wav
 *   - sample rate/channels match what the recorder actually reported
 *   - duration within ~250ms of the client-measured start/stop delta
 *   - mean_volume meaningfully above silence (> -60dB), proving the tone
 *     made it through the whole pipeline, not just the header
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
  const trackId = `scenario-a-${Date.now()}`;
  let pass = true;

  await withHarness(async ({ page }) => {
    console.log(`[A] recording track ${trackId} for ~25s...`);
    await page.evaluate((id) => window.__poc.startCapture(id), trackId);
    await page.waitForTimeout(25_000);
    const { elapsedMs, chunkCount } = await page.evaluate(() => window.__poc.stopCapture());
    console.log(`[A] stopped: client-measured elapsed=${elapsedMs.toFixed(0)}ms chunkCount=${chunkCount}`);

    const allAcked = await pollUntil(
      async () => (await page.evaluate((id) => window.__poc.ackedCount(id), trackId)) >= chunkCount,
      10_000,
    );
    if (!allAcked) {
      console.error("[A] FAIL: not all chunks acked before assembly");
      pass = false;
    }

    const assembleRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/assemble`, { method: "POST" });
      return { status: r.status, body: await r.json() };
    }, trackId);
    console.log(`[A] assemble response: ${JSON.stringify(assembleRes)}`);
    if (assembleRes.status !== 200 || !assembleRes.body.ok) {
      console.error("[A] FAIL: assembly did not succeed");
      pass = false;
      return;
    }

    const verifyRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/verify`);
      return { status: r.status, body: await r.json() };
    }, trackId);
    console.log(`[A] verify response: ${JSON.stringify(verifyRes)}`);
    if (verifyRes.status !== 200 || !verifyRes.body.ok) {
      console.error("[A] FAIL: verify did not succeed (ffprobe/ffmpeg rejected the file)");
      pass = false;
      return;
    }

    const report = verifyRes.body;
    const durationDeltaMs = Math.abs(report.durationMs - elapsedMs);
    const durationOk = durationDeltaMs <= 250;
    const volumeOk = report.meanVolumeDb !== null && report.meanVolumeDb > -60;

    console.log(
      `[A] durationMs=${report.durationMs} (delta from client=${durationDeltaMs.toFixed(0)}ms, ok=${durationOk}); ` +
        `sampleRate=${report.sampleRate}; channels=${report.channels}; ` +
        `meanVolumeDb=${report.meanVolumeDb} (ok=${volumeOk})`,
    );

    if (!durationOk) {
      console.error(`[A] FAIL: duration delta ${durationDeltaMs.toFixed(0)}ms exceeds 250ms tolerance`);
      pass = false;
    }
    if (!volumeOk) {
      console.error(`[A] FAIL: mean volume ${report.meanVolumeDb}dB is at/below silence threshold`);
      pass = false;
    }

    console.log(`[A] assembled file: ${assembleRes.body.path}`);
  }, { fakeAudioFile: tonePath });

  console.log(pass ? "PASS: Scenario A" : "FAIL: Scenario A");
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
