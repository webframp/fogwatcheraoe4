import { FOGWATCHER_SYSTEM_PROMPT, ANALYSIS_PROMPT } from "./persona.ts";

export type AnalysisResult = {
  action: "reply" | "ignore";
  confidence: number;
  reply: string | null;
  reason: string;
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** Strip markdown code fences that Gemini sometimes wraps around JSON output. */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const lines = trimmed.split("\n");
    // Remove first line (```json or ```) and last line (```)
    const inner = lines.slice(1, lines[lines.length - 1] === "```" ? -1 : undefined);
    return inner.join("\n").trim();
  }
  return trimmed;
}

/** Parse the raw Gemini API response into an AnalysisResult. Exported for testing. */
export function parseGeminiResponse(data: unknown): AnalysisResult {
  const candidates = (data as any)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("No candidates in Gemini response");
  }

  const text: string | undefined = candidates[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");

  const parsed = JSON.parse(stripMarkdownFences(text));

  if (parsed.action !== "reply" && parsed.action !== "ignore") {
    throw new Error(`Invalid action: ${parsed.action}`);
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  return {
    action: parsed.action,
    confidence: parsed.confidence,
    reply: parsed.reply ?? null,
    reason: parsed.reason ?? "",
  };
}

export async function analyzeComment(
  commentBody: string,
  apiKey: string,
): Promise<AnalysisResult> {
  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: FOGWATCHER_SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: ANALYSIS_PROMPT + commentBody }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data: unknown = await response.json();
  return parseGeminiResponse(data);
}

/** Extract retry delay from a 429 response body, returns seconds or null. */
export function parseRetryDelay(errorBody: string): number | null {
  try {
    const data = JSON.parse(errorBody);
    const details = data?.error?.details;
    if (!Array.isArray(details)) return null;
    for (const d of details) {
      if (d["@type"]?.includes("RetryInfo") && d.retryDelay) {
        const match = String(d.retryDelay).match(/^(\d+)/);
        if (match) return parseInt(match[1]!, 10);
      }
    }
  } catch {}
  return null;
}

/** Analyze with a single retry on 429 if delay is ≤ 20s. */
export async function analyzeWithRetry(
  commentBody: string,
  apiKey: string,
): Promise<AnalysisResult> {
  try {
    return await analyzeComment(commentBody, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("429")) throw err;

    const delay = parseRetryDelay(msg.replace(/^Gemini API error 429: /, ""));
    if (delay === null || delay > 20) {
      throw new Error(`Rate limited. Try again in ${delay ?? "unknown"} seconds.`);
    }

    await new Promise((r) => setTimeout(r, delay * 1000));
    return await analyzeComment(commentBody, apiKey);
  }
}
