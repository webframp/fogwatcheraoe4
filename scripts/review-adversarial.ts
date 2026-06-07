#!/usr/bin/env node --experimental-strip-types
/**
 * Adversarial review gate — deep analysis of core logic changes.
 *
 * Usage:
 *   npx tsx scripts/review-adversarial.ts [base-branch]
 *
 * Outputs the full diff of core files with the adversarial dimensions,
 * formatted for an agent to review and produce findings.
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

const corePatterns = [
  "src/server/server.ts",
  "src/server/gemini.ts",
  "src/server/logic.ts",
  "src/server/persona.ts",
];

const diff = run(`git diff ${base} --name-only`);
const changedFiles = diff.trim().split("\n").filter(Boolean);
const coreChanged = changedFiles.filter((f) =>
  corePatterns.some((p) => f === p),
);

if (coreChanged.length === 0) {
  console.log("No core logic files changed. Adversarial review not needed.");
  process.exit(0);
}

console.log("ADVERSARIAL REVIEW");
console.log("=".repeat(60));
console.log(`\nCore files changed: ${coreChanged.join(", ")}\n`);

// Print the dimensions
const dimensions = readFileSync(
  resolve(root, "agent-constraints/adversarial-dimensions.md"),
  "utf-8",
);
console.log(dimensions);

// Print the diff for each core file
console.log("\n" + "=".repeat(60));
console.log("DIFF TO REVIEW:");
console.log("=".repeat(60));

for (const file of coreChanged) {
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
Review the diff above against each adversarial dimension.
For each dimension, report one of:
  • PASS — no issues found
  • FINDING (severity): description

Severities:
  • CRITICAL — must fix before merge (logic bug, security hole)
  • HIGH — should fix (error handling gap, data integrity risk)
  • LOW — consider fixing (edge case, minor robustness improvement)

If all dimensions pass, state: "Adversarial review: PASS"
If any CRITICAL or HIGH findings exist, state: "Adversarial review: BLOCKED"
`);
