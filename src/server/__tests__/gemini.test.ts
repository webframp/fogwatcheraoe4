import { describe, it } from "node:test";
import assert from "node:assert";
import { parseGeminiResponse } from "../gemini.ts";

describe("parseGeminiResponse", () => {
  it("parses a valid reply response", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              action: "reply",
              confidence: 0.85,
              reply: "Rule 2. You know what it says.",
              reason: "Personal attack",
            }),
          }],
        },
      }],
    };

    const result = parseGeminiResponse(data);
    assert.strictEqual(result.action, "reply");
    assert.strictEqual(result.confidence, 0.85);
    assert.strictEqual(result.reply, "Rule 2. You know what it says.");
    assert.strictEqual(result.reason, "Personal attack");
  });

  it("parses a valid ignore response", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              action: "ignore",
              confidence: 0.2,
              reply: null,
              reason: "Normal discussion",
            }),
          }],
        },
      }],
    };

    const result = parseGeminiResponse(data);
    assert.strictEqual(result.action, "ignore");
    assert.strictEqual(result.confidence, 0.2);
    assert.strictEqual(result.reply, null);
    assert.strictEqual(result.reason, "Normal discussion");
  });

  it("normalizes missing reply to null", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              action: "ignore",
              confidence: 0.1,
              reason: "Fine",
            }),
          }],
        },
      }],
    };

    const result = parseGeminiResponse(data);
    assert.strictEqual(result.reply, null);
  });

  it("normalizes missing reason to empty string", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              action: "reply",
              confidence: 0.9,
              reply: "GGs only.",
            }),
          }],
        },
      }],
    };

    const result = parseGeminiResponse(data);
    assert.strictEqual(result.reason, "");
  });

  it("throws on empty candidates array", () => {
    assert.throws(
      () => parseGeminiResponse({ candidates: [] }),
      /No candidates/,
    );
  });

  it("throws on missing candidates", () => {
    assert.throws(
      () => parseGeminiResponse({}),
      /No candidates/,
    );
  });

  it("throws on missing text in response", () => {
    const data = { candidates: [{ content: { parts: [] } }] };
    assert.throws(
      () => parseGeminiResponse(data),
      /No text/,
    );
  });

  it("throws on invalid action value", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ action: "delete", confidence: 0.5, reply: null, reason: "x" }),
          }],
        },
      }],
    };
    assert.throws(
      () => parseGeminiResponse(data),
      /Invalid action/,
    );
  });

  it("throws on confidence out of range (> 1)", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ action: "reply", confidence: 1.5, reply: "x", reason: "x" }),
          }],
        },
      }],
    };
    assert.throws(
      () => parseGeminiResponse(data),
      /Invalid confidence/,
    );
  });

  it("throws on confidence out of range (< 0)", () => {
    const data = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ action: "reply", confidence: -0.1, reply: "x", reason: "x" }),
          }],
        },
      }],
    };
    assert.throws(
      () => parseGeminiResponse(data),
      /Invalid confidence/,
    );
  });

  it("throws on non-JSON text from model", () => {
    const data = {
      candidates: [{
        content: { parts: [{ text: "I'm not JSON lol" }] },
      }],
    };
    assert.throws(
      () => parseGeminiResponse(data),
    );
  });
});
