/**
 * Task 5 verification: record ~25s (4-5 timeslices), confirm every chunk
 * eventually acks and the track's OPFS directory empties out — before wiring
 * up assembly (Task 6).
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
  const trackId = `smoke-${Date.now()}`;

  await withHarness(async ({ page }) => {
    console.log(`recording track ${trackId} for 25s...`);
    await page.evaluate((id) => window.__poc.startCapture(id), trackId);
    await page.waitForTimeout(25_000);
    const { elapsedMs, chunkCount } = await page.evaluate(() => window.__poc.stopCapture());
    console.log(`stopped: elapsed=${elapsedMs.toFixed(0)}ms chunkCount=${chunkCount}`);

    const allAcked = await pollUntil(
      async () => (await page.evaluate((id) => window.__poc.ackedCount(id), trackId)) >= chunkCount,
      10_000,
    );
    const ackedCount = await page.evaluate((id) => window.__poc.ackedCount(id), trackId);
    console.log(`acked: ${ackedCount}/${chunkCount} (allAcked=${allAcked})`);

    const remainingFiles = await page.evaluate((id) => window.__poc.listOpfsFiles(id), trackId);
    console.log(`OPFS files remaining: ${JSON.stringify(remainingFiles)}`);

    const statusRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/tracks/${id}/status`);
      return r.json();
    }, trackId);
    console.log(`server status: ${JSON.stringify(statusRes)}`);

    const pass = allAcked && remainingFiles.length === 0 && statusRes.count === chunkCount;
    console.log(pass ? "PASS: all chunks acked and OPFS empty" : "FAIL");
    if (!pass) process.exitCode = 1;
  }, { fakeAudioFile: tonePath });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
