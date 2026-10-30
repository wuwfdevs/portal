/**
 * Single entry point (`npm run test:e2e`): runs the canary, the empirical
 * chunk-header dump, and both scenarios in sequence, then prints one
 * PASS/FAIL banner per stage plus the absolute path to each scenario's
 * assembled master.wav — pull those out and open them in Adobe Audition
 * yourself; nothing in this environment can do that step for you.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

interface StageResult {
  name: string;
  script: string;
  exitCode: number;
}

function runStage(name: string, script: string): Promise<StageResult> {
  return new Promise((resolve) => {
    console.log(`\n${"=".repeat(70)}\n▶ ${name}\n${"=".repeat(70)}`);
    const proc = spawn("npx", ["tsx", script], { cwd: ROOT, stdio: "inherit" });
    proc.on("close", (code) => resolve({ name, script, exitCode: code ?? 1 }));
  });
}

async function main(): Promise<void> {
  const stages = [
    { name: "Canary (WAV encoder registration)", script: "test/canary.ts" },
    { name: "Empirical chunk-header dump", script: "test/chunk-dump.ts" },
    { name: "Scenario A (happy path)", script: "test/scenario-a.ts" },
    { name: "Scenario B (reload mid-upload)", script: "test/scenario-b.ts" },
  ];

  const results: StageResult[] = [];
  for (const stage of stages) {
    results.push(await runStage(stage.name, stage.script));
  }

  console.log(`\n${"=".repeat(70)}\nSUMMARY\n${"=".repeat(70)}`);
  let allPass = true;
  for (const r of results) {
    const ok = r.exitCode === 0;
    allPass &&= ok;
    console.log(`${ok ? "PASS" : "FAIL"}  ${r.name}`);
  }

  console.log(
    "\nReminder: this validates local capture -> OPFS -> chunked upload -> " +
      "server assembly -> WAV validity only. No Daily, no live two-person call, " +
      "no real network flakiness, no cross-machine clock alignment. Opening the " +
      "assembled files in Adobe Audition is a step only you can do — see the " +
      "'assembled file:' paths printed by Scenario A/B above.",
  );

  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
