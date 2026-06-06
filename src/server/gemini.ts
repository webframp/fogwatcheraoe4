import { FOGWATCHER_SYSTEM_PROMPT, ANALYSIS_PROMPT } from "./persona.ts";

export type AnalysisResult = {
  action: "reply" | "ignore";
  confidence: number;
  reply: string | null;
  reason: string;
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** Parse the raw Gemini API response into an AnalysisResult. Exported for testing. */
export function parseGeminiResponse(data: unknown): AnalysisResult {
  const candidates = (data as any)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("No candidates in Gemini response");
  }

  const text: string | undefined = candidates[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");

  const parsed = JSON.parse(text);

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
