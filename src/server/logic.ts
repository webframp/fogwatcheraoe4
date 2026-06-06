import type { AnalysisResult } from "./gemini.ts";
import { CONFIDENCE_THRESHOLD } from "./persona.ts";

/** Determine if the app should skip processing this author. */
export function shouldSkipAuthor(authorName: string, appSlug: string): boolean {
  return authorName === appSlug || authorName === "fogwatcheraoe4";
}

/** Determine if the author is whitelisted (mod or approved user). */
export function isWhitelisted(authorName: string, whitelist: Set<string>): boolean {
  return whitelist.has(authorName.toLowerCase());
}

/** Determine if the analysis result warrants posting a reply. */
export function shouldReply(analysis: AnalysisResult, threshold?: number): boolean {
  const t = threshold ?? CONFIDENCE_THRESHOLD;
  return (
    analysis.action === "reply" &&
    analysis.confidence >= t &&
    analysis.reply !== null &&
    analysis.reply !== ""
  );
}

/** Determine if we should skip a post (no selftext = link post, nothing to analyze). */
export function shouldSkipPost(selftext: string | undefined): boolean {
  return !selftext;
}

/** Redis key for the hourly reply counter. */
export const RATE_LIMIT_KEY = "ratelimit:replies";
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_TTL = 3600; // 1 hour

/** Confidence threshold for modqueue escalation (reply + report). */
export const ESCALATION_THRESHOLD = 0.9;
