# FogWatcher — r/aoe4 Moderation Bot

A Devvit app that monitors comments and posts on r/aoe4 for toxicity, rule violations, and low-effort negativity. When triggered, it replies in the voice of FogWatcher — a techbro AoE4 veteran who frames everything through Age of Empires 4 mechanics.

## How it works

1. **Automatic (comments)**: Every new comment fires the `onCommentCreate` trigger. The comment is sent to Gemini for sentiment analysis. If flagged with sufficient confidence, FogWatcher replies.
2. **Automatic (posts)**: Every new text post fires the `onPostSubmit` trigger. Title + body are analyzed the same way.
3. **Manual**: Mods can right-click any comment and select "Reply as FogWatcher" to force an analysis and reply. This bypasses dedup — it always runs.

## Setup

Requires Node 22+.

```bash
npm install
npm run deploy
```

### Set the Gemini API key

Use the mod menu in the subreddit: **"Set FogWatcher API Key"** (appears under the subreddit three-dot menu for moderators). The key is stored in Devvit Redis.

Alternatively, you can set it via the app's mod menu after installation.

### API Key Notes

- Get a key from [aistudio.google.com](https://aistudio.google.com) → "Create API key in new project"
- Free tier has daily/per-minute quotas. If you see 429 errors with `limit: 0`, create a fresh key in a new Google Cloud project.
- The key is stored in Redis. Other mods cannot read it through any Reddit UI, but it's not encrypted at rest.

## Fetch Domains

- `generativelanguage.googleapis.com` — Gemini API for comment/post analysis and response generation.

## Architecture

- Raw Node HTTP server (not Hono/Express) — this is the Devvit Web pattern
- Gemini 2.5 Flash for analysis + response generation in a single call
- Structured JSON output (`responseMimeType: "application/json"`)
- Redis for dedup (24h TTL) and API key storage
- Confidence threshold (0.7) for auto-replies; manual menu always runs analysis

## Devvit Quirks / Lessons Learned

- **No `devvit redis` CLI command** in 0.13 — use a mod menu + form to set values
- **`isSecret: true` on form fields** only works with app-scoped settings (`SettingScope.App`), not on regular forms. Don't use it in `showForm`.
- **App-level settings** (`devvit.json` → `settings.global`) require the Devvit Blocks runtime RPC handlers. They don't work with the raw HTTP server pattern. Use Redis instead.
- **Dedup matters**: `onCommentCreate` triggers can fire more than once. Mark comments as processed only after successful analysis, not before — otherwise transient failures (429s) permanently block retries.
- **Model availability**: Gemini model names change. `gemini-2.0-flash-lite` was deprecated. Use `gemini-2.5-flash` or check current availability.
- **`npm run deploy`** auto-bumps the version and installs to the default playtest subreddit.

## Commands

- `npm run dev`: Starts playtest with watch mode
- `npm run build`: Builds the server bundle
- `npm run deploy`: Builds and uploads to Reddit
- `npx devvit logs r/SUBREDDIT --since=5m`: Stream logs
