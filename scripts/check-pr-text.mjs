#!/usr/bin/env node
// Fails a pull request whose title or description was left as a placeholder.
//
// Why this exists: a PR opened straight from a branch push inherits its title
// from the branch name ("Claude/zen carson fchjy1") or the merge commit
// ("Merge pull request #257 from …"), and its body from whatever the last
// commit message held — or nothing. Several shipped that way. A reviewer can't
// tell what the change is for, and the history reads like noise. This check is
// the backstop that doesn't depend on who or what opened the PR.
//
// Zero dependencies, on purpose; it runs in CI before anything is installed.
// Pure logic is exported for scripts/check-pr-text.test.mjs; the CLI reads
// PR_TITLE, PR_BODY and PR_HEAD_REF from the environment (never interpolated
// into a shell command, so PR text can't inject anything).

import { fileURLToPath } from "node:url";

/** Fewest characters of real prose a description needs once trailers and links are removed. */
export const MIN_BODY_CHARS = 60;

/** Fewest characters a title needs to say anything. */
export const MIN_TITLE_CHARS = 12;

/** The text of a description that is actually written for a reader: no commit trailers, bare links, rules or the Claude Code footer. */
export function proseOf(body) {
  return (body ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !/^(co-authored-by|claude-session|signed-off-by):/i.test(line) &&
        !/^https?:\/\/\S+$/i.test(line) &&
        !/^-{3,}$/.test(line) &&
        !/^_?generated (with|by) \[?claude code/i.test(line) &&
        !/^🤖 generated with/i.test(line) &&
        // A heading with nothing under it is structure, not content.
        !/^#{1,6}\s/.test(line),
    )
    .join(" ")
    .trim();
}

/** A string with case, spaces, slashes, dashes and underscores removed, to compare a title with a branch name. */
function squash(text) {
  return text.replace(/[\s/_-]+/g, "").toLowerCase();
}

/** The template sections every description keeps (.github/pull_request_template.md); Database and Not included are optional. */
export const REQUIRED_SECTIONS = ["Summary", "What changed", "Test plan"];

/** Every reason this title/body pair isn't ready for review; empty when it is. */
export function checkPrText({ title, body, headRef = "" }) {
  const problems = [];
  const t = (title ?? "").trim();

  if (t.length < MIN_TITLE_CHARS) {
    problems.push(`The title is too short to say what changed (${t.length} characters).`);
  }
  if (/^claude\//i.test(t)) {
    problems.push("The title is a branch name. Say what the change does.");
  } else if (headRef && squash(t) === squash(headRef)) {
    problems.push("The title is the branch name. Say what the change does.");
  }
  if (/^merge (pull request|branch|remote-tracking branch)\b/i.test(t)) {
    problems.push("The title is a merge commit message. Say what the change does.");
  }
  if (/(…|\.\.\.)$/.test(t)) {
    problems.push(
      "The title is cut off mid-sentence. Finish it and move the rest to the description.",
    );
  }

  const prose = proseOf(body);
  if (prose.length === 0) {
    problems.push("The description is empty.");
  } else if (prose.length < MIN_BODY_CHARS) {
    problems.push(
      `The description is only ${prose.length} characters of prose (at least ${MIN_BODY_CHARS}). Say what changed and why.`,
    );
  }
  // A body generated from commit messages has prose but none of the template's sections.
  const headings = new Set(
    (body ?? "")
      .split(/\r?\n/)
      .map((line) => /^#{1,6}\s+(.*?)\s*#*$/.exec(line.trim())?.[1]?.toLowerCase())
      .filter(Boolean),
  );
  const missing = REQUIRED_SECTIONS.filter((name) => !headings.has(name.toLowerCase()));
  if (prose.length > 0 && missing.length > 0) {
    problems.push(
      `The description is missing the template's ${missing.map((name) => `"${name}"`).join(", ")} section${missing.length === 1 ? "" : "s"} (.github/pull_request_template.md).`,
    );
  }
  return problems;
}

function main() {
  const problems = checkPrText({
    title: process.env.PR_TITLE,
    body: process.env.PR_BODY,
    headRef: process.env.PR_HEAD_REF,
  });
  if (problems.length === 0) {
    console.log("PR title and description look written for a reader.");
    return;
  }
  console.error("This PR's title or description needs work:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "\nEdit the PR's title and description (the check re-runs when you do). See .github/pull_request_template.md for the shape.",
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
