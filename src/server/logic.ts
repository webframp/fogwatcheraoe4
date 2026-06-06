import type { AnalysisResult } from "./gemini.ts";
import { CONFIDENCE_THRESHOLD } from "./persona.ts";

/** Determine if the app should skip processing this author. */
export function shouldSkipAuthor(authorName: string, appSlug: string): boolean {
  return authorName === appSlug || authorName === "fogwatcheraoe4";
}

/** Determine if the analysis result warrants posting a reply. */
export function shouldReply(analysis: AnalysisResult): boolean {
  return (
    analysis.action === "reply" &&
    analysis.confidence >= CONFIDENCE_THRESHOLD &&
    analysis.reply !== null &&
    analysis.reply !== ""
  );
}

/** Determine if we should skip a post (no selftext = link post, nothing to analyze). */
export function shouldSkipPost(selftext: string | undefined): boolean {
  return !selftext;
}
