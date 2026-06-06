import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { context, redis, reddit } from "@devvit/web/server";
import type {
  MenuItemRequest,
  OnCommentCreateRequest,
  OnPostSubmitRequest,
  TriggerResponse,
  UiResponse,
} from "@devvit/web/shared";
import { analyzeComment } from "./gemini.ts";
import { CONFIDENCE_THRESHOLD } from "./persona.ts";

const GEMINI_KEY_REDIS = "config:gemini_api_key";

async function getApiKey(): Promise<string | undefined> {
  return (await redis.get(GEMINI_KEY_REDIS)) ?? undefined;
}

export async function serverOnRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  try {
    await onRequest(req, rsp);
  } catch (err) {
    const msg = `server error; ${err instanceof Error ? err.stack : err}`;
    console.error(msg);
    writeJSON(500, { error: msg }, rsp);
  }
}

async function onRequest(
  req: IncomingMessage,
  rsp: ServerResponse,
): Promise<void> {
  const url = req.url;

  if (url === "/internal/on-comment-create") {
    const body = await readJSON<OnCommentCreateRequest>(req);
    const result = await onCommentCreate(body);
    writeJSON(200, result, rsp);
    return;
  }

  if (url === "/internal/on-post-submit") {
    const body = await readJSON<OnPostSubmitRequest>(req);
    const result = await onPostSubmit(body);
    writeJSON(200, result, rsp);
    return;
  }

  if (url === "/internal/menu/fogwatcher-reply") {
    const body = await readJSON<MenuItemRequest>(req);
    const result = await onMenuFogwatcherReply(body);
    writeJSON(200, result, rsp);
    return;
  }

  if (url === "/internal/menu/set-api-key") {
    console.log("set-api-key menu hit");
    await readJSON<MenuItemRequest>(req);
    const result: UiResponse = {
      showForm: {
        name: "apiKeyForm",
        form: {
          title: "Configure FogWatcher",
          fields: [{ type: "string", name: "apiKey", label: "Gemini API Key", required: true }],
          acceptLabel: "Save",
        },
      },
    };
    writeJSON(200, result, rsp);
    return;
  }

  if (url === "/internal/form/set-api-key") {
    const body = await readJSON<{ apiKey: string }>(req);
    await redis.set(GEMINI_KEY_REDIS, body.apiKey);
    writeJSON(200, { showToast: { text: "API key saved.", appearance: "success" } }, rsp);
    return;
  }

  writeJSON(404, { error: "not found" }, rsp);
}

async function onCommentCreate(
  input: OnCommentCreateRequest,
): Promise<TriggerResponse> {
  const comment = input.comment;
  const author = input.author;

  if (!comment || !author) {
    console.log("Missing comment or author data, skipping");
    return {};
  }

  // Avoid replying to ourselves
  if (author.name === context.appSlug || author.name === "fogwatcheraoe4") {
    return {};
  }

  // Dedup: check if we already processed this comment
  const dedupKey = `processed:${comment.id}`;
  const already = await redis.get(dedupKey);
  if (already) {
    console.log(`Already processed comment ${comment.id}, skipping`);
    return {};
  }

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error("No Gemini API key configured. Run: npx devvit settings set gemini_api_key");
    return {};
  }

  // Analyze comment
  let analysis;
  try {
    analysis = await analyzeComment(comment.body, apiKey);
  } catch (err) {
    console.error(`Gemini analysis failed: ${err}`);
    return {};
  }

  // Mark as processed only after successful analysis
  await redis.set(dedupKey, "1");
  await redis.expire(dedupKey, 86400);

  console.log(
    `Comment ${comment.id} by ${author.name}: action=${analysis.action} confidence=${analysis.confidence} reason=${analysis.reason}`,
  );

  // Only reply if action is "reply" and confidence exceeds threshold
  if (analysis.action === "reply" && analysis.confidence >= CONFIDENCE_THRESHOLD && analysis.reply) {
    try {
      await reddit.submitComment({
        id: comment.id as `t1_${string}`,
        text: analysis.reply,
        runAs: "APP",
      });
      console.log(`Replied to comment ${comment.id}`);
    } catch (err) {
      console.error(`Failed to reply to ${comment.id}: ${err}`);
    }
  }

  return {};
}

async function onPostSubmit(
  input: OnPostSubmitRequest,
): Promise<TriggerResponse> {
  const post = input.post;
  const author = input.author;

  if (!post || !author) return {};
  if (author.name === context.appSlug || author.name === "fogwatcheraoe4") return {};

  // Only analyze text posts with content
  const text = `${post.title}\n${post.selftext}`.trim();
  if (!post.selftext) return {};

  const dedupKey = `processed:${post.id}`;
  const already = await redis.get(dedupKey);
  if (already) return {};

  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error("No Gemini API key configured.");
    return {};
  }

  let analysis;
  try {
    analysis = await analyzeComment(text, apiKey);
  } catch (err) {
    console.error(`Gemini analysis failed for post ${post.id}: ${err}`);
    return {};
  }

  await redis.set(dedupKey, "1");
  await redis.expire(dedupKey, 86400);

  console.log(
    `Post ${post.id} by ${author.name}: action=${analysis.action} confidence=${analysis.confidence} reason=${analysis.reason}`,
  );

  if (analysis.action === "reply" && analysis.confidence >= CONFIDENCE_THRESHOLD && analysis.reply) {
    try {
      await reddit.submitComment({
        id: post.id as `t3_${string}`,
        text: analysis.reply,
        runAs: "APP",
      });
      console.log(`Replied to post ${post.id}`);
    } catch (err) {
      console.error(`Failed to reply to post ${post.id}: ${err}`);
    }
  }

  return {};
}

async function onMenuFogwatcherReply(
  input: MenuItemRequest,
): Promise<UiResponse> {
  const commentId = input.targetId;

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { showToast: { text: "No API key. Use 'Set FogWatcher API Key' menu first.", appearance: "neutral" } };
  }

  // Fetch the comment to get its body
  const comment = await reddit.getCommentById(commentId as `t1_${string}`);
  if (!comment) {
    return { showToast: { text: "Could not fetch comment.", appearance: "neutral" } };
  }

  // Analyze
  let analysis;
  try {
    analysis = await analyzeComment(comment.body, apiKey);
  } catch (err) {
    return { showToast: { text: `Analysis failed: ${err}`, appearance: "neutral" } };
  }

  if (analysis.action === "ignore" || !analysis.reply) {
    return { showToast: { text: "Comment looks fine. No reply needed.", appearance: "neutral" } };
  }

  try {
    await reddit.submitComment({
      id: commentId as `t1_${string}`,
      text: analysis.reply,
      runAs: "APP",
    });
    // Mark as replied so the auto-trigger doesn't double up
    await redis.set(`processed:${commentId}`, "1");
    await redis.expire(`processed:${commentId}`, 86400);
  } catch (err) {
    return { showToast: { text: `Failed to reply: ${err}`, appearance: "neutral" } };
  }

  return { showToast: { text: "FogWatcher has spoken.", appearance: "success" } };
}

function writeJSON(status: number, json: unknown, rsp: ServerResponse): void {
  const body = JSON.stringify(json);
  rsp.writeHead(status, {
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  rsp.end(body);
}

async function readJSON<T>(req: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  await once(req, "end");
  return JSON.parse(`${Buffer.concat(chunks)}`);
}
