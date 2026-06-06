import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldSkipAuthor, shouldReply, shouldSkipPost } from "../logic.ts";
import type { AnalysisResult } from "../gemini.ts";

describe("shouldSkipAuthor", () => {
  it("skips when author matches appSlug", () => {
    assert.strictEqual(shouldSkipAuthor("fogwatcheraoe4", "fogwatcheraoe4"), true);
  });

  it("skips when author is the hardcoded app name", () => {
    assert.strictEqual(shouldSkipAuthor("fogwatcheraoe4", "some-other-slug"), true);
  });

  it("skips when author matches a different appSlug", () => {
    assert.strictEqual(shouldSkipAuthor("myapp", "myapp"), true);
  });

  it("does not skip normal users", () => {
    assert.strictEqual(shouldSkipAuthor("some_user", "fogwatcheraoe4"), false);
  });

  it("does not skip similar-but-different names", () => {
    assert.strictEqual(shouldSkipAuthor("fogwatcher", "fogwatcheraoe4"), false);
  });
});

describe("shouldReply", () => {
  it("returns true when action is reply, confidence above threshold, and reply exists", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0.85,
      reply: "Rule 2. You know what it says.",
      reason: "toxicity",
    };
    assert.strictEqual(shouldReply(analysis), true);
  });

  it("returns true at exactly the threshold (0.7)", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0.7,
      reply: "Scout it before you commit.",
      reason: "low effort",
    };
    assert.strictEqual(shouldReply(analysis), true);
  });

  it("returns false when action is ignore", () => {
    const analysis: AnalysisResult = {
      action: "ignore",
      confidence: 0.9,
      reply: "Some reply text",
      reason: "fine",
    };
    assert.strictEqual(shouldReply(analysis), false);
  });

  it("returns false when confidence is below threshold", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0.69,
      reply: "Almost flagged",
      reason: "borderline",
    };
    assert.strictEqual(shouldReply(analysis), false);
  });

  it("returns false when reply is null", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0.9,
      reply: null,
      reason: "model error",
    };
    assert.strictEqual(shouldReply(analysis), false);
  });

  it("returns false when reply is empty string", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0.9,
      reply: "",
      reason: "model returned empty",
    };
    assert.strictEqual(shouldReply(analysis), false);
  });

  it("returns false when confidence is zero", () => {
    const analysis: AnalysisResult = {
      action: "reply",
      confidence: 0,
      reply: "text",
      reason: "no confidence",
    };
    assert.strictEqual(shouldReply(analysis), false);
  });
});

describe("shouldSkipPost", () => {
  it("skips when selftext is undefined", () => {
    assert.strictEqual(shouldSkipPost(undefined), true);
  });

  it("skips when selftext is empty string", () => {
    assert.strictEqual(shouldSkipPost(""), true);
  });

  it("does not skip when selftext has content", () => {
    assert.strictEqual(shouldSkipPost("This is my post content"), false);
  });

  it("does not skip when selftext is whitespace only", () => {
    // Whitespace-only still passes — the analysis handles whether it's meaningful
    assert.strictEqual(shouldSkipPost("   "), false);
  });
});
