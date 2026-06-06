import { FOGWATCHER_SYSTEM_PROMPT, ANALYSIS_PROMPT } from "./persona.ts";

export type AnalysisResult = {
  action: "reply" | "ignore";
  confidence: number;
  reply: string | null;
  reason: string;
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

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

  const data: any = await response.json();
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini");

  return JSON.parse(text) as AnalysisResult;
}
