#!/usr/bin/env node --experimental-strip-types
/**
 * Code review gate — run before opening a PR.
 *
 * Usage:
 *   npx tsx scripts/review-code.ts [base-branch]
 *
 * Runs type-check, tests, and prints a review checklist against the diff.
 * Exits non-zero if type-check or tests fail.
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

function runOrFail(cmd: string, label: string): boolean {
  console.log(`\n▶ ${label}`);
  try {
    execSync(cmd, { cwd: root, encoding: "utf-8", stdio: "inherit" });
    console.log(`  ✓ ${label} passed`);
    return true;
  } catch {
    console.error(`  ✗ ${label} FAILED`);
    return false;
  }
}

// Mandatory gates
const gates = [
  runOrFail("npx tsc --build", "Type check"),
  runOrFail("npm test", "Tests"),
];

if (gates.some((g) => !g)) {
  console.error("\n✗ Mandatory gates failed. Fix before opening PR.");
  process.exit(1);
}

// Diff analysis
console.log(`\n▶ Analyzing diff against ${base}...`);
const diff = run(`git diff ${base} --name-only`);
const changedFiles = diff.trim().split("\n").filter(Boolean);

if (changedFiles.length === 0) {
  console.log("  No changes detected.");
  process.exit(0);
}

console.log(`  Changed files (${changedFiles.length}):`);
changedFiles.forEach((f) => console.log(`    ${f}`));

// Load review conventions
const conventions = readFileSync(
  resolve(root, "agent-constraints/code-review.md"),
  "utf-8",
);

// Determine which reviews apply
const coreFiles = changedFiles.filter(
  (f) => f.startsWith("src/server/") && !f.includes("__tests__"),
);
const workflowFiles = changedFiles.filter((f) =>
  f.startsWith(".github/workflows/"),
);
const designFiles = changedFiles.filter(
  (f) => f.startsWith("design/") || f === "CLAUDE.md",
);

console.log("\n▶ Applicable review gates:");
console.log(`  • Code review: always`);
if (coreFiles.length > 0) {
  console.log(`  • Adversarial review: ${coreFiles.length} core file(s) changed`);
}
if (workflowFiles.length > 0) {
  console.log(`  • CI security review: ${workflowFiles.length} workflow file(s) changed`);
}

// Output the review prompt for the agent to act on
console.log("\n" + "=".repeat(60));
console.log("REVIEW CHECKLIST (agent should verify each):");
console.log("=".repeat(60));
console.log(conventions);

if (coreFiles.length > 0) {
  const adversarial = readFileSync(
    resolve(root, "agent-constraints/adversarial-dimensions.md"),
    "utf-8",
  );
  console.log("\n" + "=".repeat(60));
  console.log("ADVERSARIAL DIMENSIONS (core logic changed):");
  console.log("=".repeat(60));
  console.log(adversarial);
}

if (workflowFiles.length > 0) {
  const ciSecurity = readFileSync(
    resolve(root, "agent-constraints/ci-security.md"),
    "utf-8",
  );
  console.log("\n" + "=".repeat(60));
  console.log("CI SECURITY REVIEW (workflow files changed):");
  console.log("=".repeat(60));
  console.log(ciSecurity);
}

// Check if design docs need updating
if (coreFiles.length > 0 && designFiles.length === 0) {
  console.log("\n⚠ Core files changed but no design docs updated.");
  console.log("  Verify: does this change affect behavior described in design/*.md?");
}

console.log("\n✓ Mandatory gates passed. Review checklist printed above.");
console.log("  Run the adversarial review by reading the diff and checking each dimension.");
