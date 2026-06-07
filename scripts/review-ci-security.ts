#!/usr/bin/env node --experimental-strip-types
/**
 * CI security review gate — audit workflow file changes.
 *
 * Usage:
 *   npx tsx scripts/review-ci-security.ts [base-branch]
 *
 * Only produces output if workflow files have changed.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "origin/main";
const root = resolve(import.meta.dirname!, "..");

function run(cmd: string): string {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf-8", stdio: "pipe" });
  } catch (e: any) {
    return e.stdout ?? e.message;
  }
}

const diff = run(`git diff ${base} --name-only`);
const changedFiles = diff.trim().split("\n").filter(Boolean);
const workflowFiles = changedFiles.filter((f) =>
  f.startsWith(".github/workflows/"),
);

if (workflowFiles.length === 0) {
  console.log("No workflow files changed. CI security review not needed.");
  process.exit(0);
}

console.log("CI SECURITY REVIEW");
console.log("=".repeat(60));
console.log(`\nWorkflow files changed: ${workflowFiles.join(", ")}\n`);

// Print the checklist
const checklist = readFileSync(
  resolve(root, "agent-constraints/ci-security.md"),
  "utf-8",
);
console.log(checklist);

// Print the diff
console.log("\n" + "=".repeat(60));
console.log("DIFF TO REVIEW:");
console.log("=".repeat(60));

for (const file of workflowFiles) {
  const fileDiff = run(`git diff ${base} -- ${file}`);
  if (fileDiff.trim()) {
    console.log(`\n--- ${file} ---`);
    console.log(fileDiff);
  }
}

console.log("\n" + "=".repeat(60));
console.log("INSTRUCTIONS:");
console.log("=".repeat(60));
console.log(`
Audit each workflow change against the CI security checklist above.
For each item, report PASS or FINDING with description.

If all items pass, state: "CI security review: PASS"
If any findings exist, state severity (CRITICAL/HIGH/LOW) and what to fix.
`);
