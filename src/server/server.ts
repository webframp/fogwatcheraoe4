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
import { analyzeComment, analyzeWithRetry } from "./gemini.ts";
import { shouldSkipAuthor, shouldReply, shouldSkipPost, isWhitelisted, RATE_LIMIT_KEY, RATE_LIMIT_MAX, RATE_LIMIT_TTL, ESCALATION_THRESHOLD } from "./logic.ts";

const GEMINI_KEY_REDIS = "config:gemini_api_key";

async function getApiKey(): Promise<string | undefined> {
  return (await redis.get(GEMINI_KEY_REDIS)) ?? undefined;
}

async function getThreshold(): Promise<number> {
  const val = await redis.get("config:confidence_threshold");
  if (val) {
    const n = parseFloat(val);
    if (isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return 0.7; // default
}

async function getWhitelist(): Promise<Set<string>> {
  const cached = await redis.get("cache:whitelist");
  if (cached) {
    try {
      return new Set(JSON.parse(cached) as string[]);
    } catch {}
  }

  // Refresh from Reddit API
  const subreddit = context.subredditName;
  const names: string[] = [];
  try {
    const mods = await reddit.getModerators({ subredditName: subreddit }).all();
    for (const mod of mods) names.push(mod.username.toLowerCase());
  } catch (err) {
    console.error(`Failed to fetch mods: ${err}`);
  }
  try {
    const approved = await reddit.getApprovedUsers({ subredditName: subreddit }).all();
    for (const user of approved) names.push(user.username.toLowerCase());
  } catch (err) {
    console.error(`Failed to fetch approved users: ${err}`);
  }

  // Cache for 10 minutes
  await redis.set("cache:whitelist", JSON.stringify(names));
  await redis.expire("cache:whitelist", 600);
  return new Set(names);
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

  if (url === "/internal/menu/fogwatcher-dry-run") {
    const body = await readJSON<MenuItemRequest>(req);
    const result = await onMenuFogwatcherDryRun(body);
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

  if (url === "/internal/menu/settings") {
    const currentThreshold = await redis.get("config:confidence_threshold");
    const enabled = await redis.get("config:enabled");
    const currentStatus = enabled === "0" ? "disabled" : "active";
    const result: UiResponse = {
      showForm: {
        name: "settingsForm",
        form: {
          title: "FogWatcher Settings",
          fields: [
            {
              type: "select",
              name: "status",
              label: "Status",
              options: [
                { label: "Active", value: "active" },
                { label: "Pause 1 hour", value: "pause_1h" },
                { label: "Pause 6 hours", value: "pause_6h" },
                { label: "Pause 24 hours", value: "pause_24h" },
                { label: "Disabled", value: "disabled" },
              ],
            },
            { type: "string", name: "threshold", label: "Confidence threshold (0.0–1.0)", helpText: "Default: 0.7 if left empty" },
          ],
          acceptLabel: "Save",
        },
        data: { status: [currentStatus], threshold: currentThreshold ?? "0.7" },
      },
    };
    writeJSON(200, result, rsp);
    return;
  }

  if (url === "/internal/form/settings") {
    const body = await readJSON<{ threshold: string; status: string[] }>(req);

    // Handle status
    const status = body.status?.[0] ?? "active";
    if (status === "active") {
      await redis.del("config:enabled");
    } else if (status === "disabled") {
      await redis.set("config:enabled", "0");
    } else {
      const hours: Record<string, number> = { pause_1h: 1, pause_6h: 6, pause_24h: 24 };
      const ttl = (hours[status] ?? 1) * 3600;
      await redis.set("config:enabled", "0");
      await redis.expire("config:enabled", ttl);
    }

    // Handle threshold
    const thresholdStr = body.threshold?.trim();
    if (thresholdStr) {
      const n = parseFloat(thresholdStr);
      if (!isFinite(n) || n < 0 || n > 1) {
        writeJSON(200, { showToast: { text: "Threshold must be between 0.0 and 1.0", appearance: "neutral" } }, rsp);
        return;
      }
      await redis.set("config:confidence_threshold", String(n));
    }

    const statusMsg = status === "active" ? "Active" : status === "disabled" ? "Disabled" : `Paused (${status.replace("pause_", "")})`;
    const currentThreshold = await redis.get("config:confidence_threshold") ?? "0.7";
    writeJSON(200, { showToast: { text: `Settings saved. Status: ${statusMsg}, Threshold: ${currentThreshold}`, appearance: "success" } }, rsp);
    return;
  }

  writeJSON(404, { error: "not found" }, rsp);
}

async function onCommentCreate(
  input: OnCommentCreateRequest,
): Promise<TriggerResponse> {
  // Check if bot is paused/disabled
  const enabled = await redis.get("config:enabled");
  if (enabled === "0") return {};

  const comment = input.comment;
  const author = input.author;

  if (!comment || !author) {
    console.log("Missing comment or author data, skipping");
    return {};
  }

  // Avoid replying to ourselves
  if (shouldSkipAuthor(author.name, context.appSlug)) {
    return {};
  }

  // Skip whitelisted users (mods + approved users)
  const whitelist = await getWhitelist();
  if (isWhitelisted(author.name, whitelist)) {
    console.log(`Skipping whitelisted user ${author.name} on comment ${comment.id}`);
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
  const threshold = await getThreshold();

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
  if (shouldReply(analysis, threshold)) {
    // Rate limit check
    const count = parseInt((await redis.get(RATE_LIMIT_KEY)) ?? "0", 10);
    if (count >= RATE_LIMIT_MAX) {
      console.log(`Rate limited. Would have replied to comment ${comment.id}: ${analysis.reply}`);
      return {};
    }

    try {
      await reddit.submitComment({
        id: comment.id as `t1_${string}`,
        text: analysis.reply!,
        runAs: "APP",
      });
      await redis.incrBy(RATE_LIMIT_KEY, 1);
      const ttl = await redis.expireTime(RATE_LIMIT_KEY);
      if (ttl <= 0) await redis.expire(RATE_LIMIT_KEY, RATE_LIMIT_TTL);
      console.log(`Replied to comment ${comment.id}`);
      await redis.incrBy("stats:total_replies", 1);

      // Escalate to modqueue for high-confidence flags
      if (analysis.confidence >= ESCALATION_THRESHOLD) {
        try {
          const commentObj = await reddit.getCommentById(comment.id as `t1_${string}`);
          await reddit.report(commentObj, { reason: `FogWatcher: ${analysis.reason} (${analysis.confidence.toFixed(2)})` });
          console.log(`Reported comment ${comment.id} to modqueue`);
        } catch (reportErr) {
          console.error(`Failed to report ${comment.id}: ${reportErr}`);
        }
      }
    } catch (err) {
      console.error(`Failed to reply to ${comment.id}: ${err}`);
    }
  }

  return {};
}

async function onPostSubmit(
  input: OnPostSubmitRequest,
): Promise<TriggerResponse> {
  // Check if bot is paused/disabled
  const enabled = await redis.get("config:enabled");
  if (enabled === "0") return {};

  const post = input.post;
  const author = input.author;

  if (!post || !author) return {};
  if (shouldSkipAuthor(author.name, context.appSlug)) return {};

  // Skip whitelisted users
  const whitelist = await getWhitelist();
  if (isWhitelisted(author.name, whitelist)) {
    console.log(`Skipping whitelisted user ${author.name} on post ${post.id}`);
    return {};
  }

  // Only analyze text posts with content
  const text = `${post.title}\n${post.selftext}`.trim();
  if (shouldSkipPost(post.selftext)) return {};

  const dedupKey = `processed:${post.id}`;
  const already = await redis.get(dedupKey);
  if (already) return {};

  const apiKey = await getApiKey();
  if (!apiKey) {
    console.error("No Gemini API key configured.");
    return {};
  }
  const threshold = await getThreshold();

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

  if (shouldReply(analysis, threshold)) {
    const count = parseInt((await redis.get(RATE_LIMIT_KEY)) ?? "0", 10);
    if (count >= RATE_LIMIT_MAX) {
      console.log(`Rate limited. Would have replied to post ${post.id}: ${analysis.reply}`);
      return {};
    }

    try {
      await reddit.submitComment({
        id: post.id as `t3_${string}`,
        text: analysis.reply!,
        runAs: "APP",
      });
      await redis.incrBy(RATE_LIMIT_KEY, 1);
      const ttl = await redis.expireTime(RATE_LIMIT_KEY);
      if (ttl <= 0) await redis.expire(RATE_LIMIT_KEY, RATE_LIMIT_TTL);
      console.log(`Replied to post ${post.id}`);
      await redis.incrBy("stats:total_replies", 1);

      // Escalate to modqueue for high-confidence flags
      if (analysis.confidence >= ESCALATION_THRESHOLD) {
        try {
          const postObj = await reddit.getPostById(post.id as `t3_${string}`);
          await reddit.report(postObj, { reason: `FogWatcher: ${analysis.reason} (${analysis.confidence.toFixed(2)})` });
          console.log(`Reported post ${post.id} to modqueue`);
        } catch (reportErr) {
          console.error(`Failed to report post ${post.id}: ${reportErr}`);
        }
      }
    } catch (err) {
      console.error(`Failed to reply to post ${post.id}: ${err}`);
    }
  }

  return {};
}

async function onMenuFogwatcherReply(
  input: MenuItemRequest,
): Promise<UiResponse> {
  const targetId = input.targetId;

  // Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { showToast: { text: "No API key. Use 'Set FogWatcher API Key' menu first.", appearance: "neutral" } };
  }

  // Fetch content based on thing type
  let contentBody: string;
  if (targetId.startsWith("t1_")) {
    const comment = await reddit.getCommentById(targetId as `t1_${string}`);
    if (!comment) return { showToast: { text: "Could not fetch comment.", appearance: "neutral" } };
    contentBody = comment.body;
  } else if (targetId.startsWith("t3_")) {
    const post = await reddit.getPostById(targetId as `t3_${string}`);
    if (!post) return { showToast: { text: "Could not fetch post.", appearance: "neutral" } };
    contentBody = `${post.title}\n${post.body ?? ""}`.trim();
  } else {
    return { showToast: { text: `Unsupported target: ${targetId}`, appearance: "neutral" } };
  }

  // Analyze with retry on 429
  let analysis;
  try {
    analysis = await analyzeWithRetry(contentBody, apiKey);
  } catch (err) {
    return { showToast: { text: `Analysis failed: ${err}`, appearance: "neutral" } };
  }

  if (analysis.action === "ignore" || !analysis.reply) {
    return { showToast: { text: "Content looks fine. No reply needed.", appearance: "neutral" } };
  }

  try {
    await reddit.submitComment({
      id: targetId as `t1_${string}` | `t3_${string}`,
      text: analysis.reply!,
      runAs: "APP",
    });
    await redis.set(`processed:${targetId}`, "1");
    await redis.expire(`processed:${targetId}`, 86400);
  } catch (err) {
    return { showToast: { text: `Failed to reply: ${err}`, appearance: "neutral" } };
  }

  return { showToast: { text: "FogWatcher has spoken.", appearance: "success" } };
}

async function onMenuFogwatcherDryRun(
  input: MenuItemRequest,
): Promise<UiResponse> {
  const targetId = input.targetId;

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { showToast: { text: "No API key. Use 'Set FogWatcher API Key' menu first.", appearance: "neutral" } };
  }

  // Fetch content
  let contentBody: string;
  if (targetId.startsWith("t1_")) {
    const comment = await reddit.getCommentById(targetId as `t1_${string}`);
    if (!comment) return { showToast: { text: "Could not fetch comment.", appearance: "neutral" } };
    contentBody = comment.body;
  } else if (targetId.startsWith("t3_")) {
    const post = await reddit.getPostById(targetId as `t3_${string}`);
    if (!post) return { showToast: { text: "Could not fetch post.", appearance: "neutral" } };
    contentBody = `${post.title}\n${post.body ?? ""}`.trim();
  } else {
    return { showToast: { text: `Unsupported target: ${targetId}`, appearance: "neutral" } };
  }

  let analysis;
  try {
    analysis = await analyzeWithRetry(contentBody, apiKey);
  } catch (err) {
    return { showToast: { text: `Analysis failed: ${err}`, appearance: "neutral" } };
  }

  // Show the result as a toast — never post
  if (analysis.action === "ignore" || !analysis.reply) {
    return { showToast: { text: `[DRY RUN] Would ignore (${analysis.confidence.toFixed(2)}): ${analysis.reason}`, appearance: "neutral" } };
  }

  console.log(`[DRY RUN] ${targetId}: Would reply (${analysis.confidence.toFixed(2)}): ${analysis.reply}`);
  return { showToast: { text: `[DRY RUN] Would reply (${analysis.confidence.toFixed(2)}): ${analysis.reply!.slice(0, 100)}`, appearance: "success" } };
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
