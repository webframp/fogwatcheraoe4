# FogWatcher — Agent Guidance

## What This Is

A Devvit mod bot for r/aoe4. It analyzes comments and posts via Gemini, replies in-character as FogWatcher when content warrants moderation. Simple architecture, single purpose.

## Ubiquitous Language

- **Analysis**: The Gemini API call that evaluates a comment/post and returns a structured verdict
- **Flagged**: Analysis returned `action: "reply"` with confidence above threshold
- **Confidence threshold**: Currently 0.7. Below this, no action is taken even if the model says "reply"
- **Dedup**: Redis key (`processed:{thingId}`) with 24h TTL preventing duplicate processing
- **Persona**: The FogWatcher character definition — system prompt that governs tone and vocabulary
- **Thing ID**: Reddit's prefixed identifiers — `t1_` (comment), `t3_` (post), `t5_` (subreddit)

## Bounded Context

This entire app is one bounded context: **Comment Moderation**. It observes content, evaluates it, and optionally responds.

If the app grows, keep new capabilities in separate modules:
- Strike tracking / escalation → separate module with its own Redis keys
- Ban automation → separate module, don't tangle with analysis
- Analytics / reporting → read from Redis events, don't couple to the trigger path

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Raw Node HTTP server | Devvit Web pattern. No framework overhead. Menu items, triggers, and forms all route through `onRequest`. |
| Redis for API key | App-level settings (`devvit.json` → `settings.global`) require Devvit Blocks runtime RPC handlers that don't exist in the raw HTTP server pattern. Redis works. |
| Gemini 2.5 Flash | Only OpenAI and Gemini are allowed by Devvit's HTTP fetch policy. Gemini has a free tier. |
| Single LLM call | Analysis + response generation in one call. Cheaper, simpler, lower latency than two-stage (classify then generate). |
| Dedup after success | Mark as processed only after successful Gemini analysis. Transient failures (429s) don't permanently block retries. |
| Manual menu bypasses dedup | A mod clicking "Reply as FogWatcher" always runs fresh analysis regardless of prior processing state. |

## Extension Points

### Adding a new trigger
1. Add the trigger to `devvit.json` under `triggers`
2. Add a route in `server.ts` → `onRequest()`
3. Add the handler function with appropriate dedup strategy

### Adding new response behaviors
The persona config in `persona.ts` controls what gets flagged and how FogWatcher responds. Adjust:
- `FOGWATCHER_SYSTEM_PROMPT` — character voice and mod behavior rules
- `ANALYSIS_PROMPT` — what constitutes "flagged" vs "ignored"
- `CONFIDENCE_THRESHOLD` — sensitivity dial

### Adding mod actions beyond replies
`reddit` client supports `remove()`, `lock()`, `report()`, etc. Layer these as severity escalation:
- Low confidence → ignore
- Medium confidence → reply only
- High confidence → reply + report to modqueue

## Anti-Corruption Layers

- `gemini.ts` — All LLM interaction isolated here. Swap models or providers by changing this file only.
- `persona.ts` — All character/prompt configuration. Change personality without touching server logic.
- `server.ts` — Routing and orchestration. Knows about Reddit and Redis but delegates analysis.

## Testing Without Burning Quota

- Use `r/fogwatcheraoe4_dev` as the playtest subreddit
- For rapid iteration on prompts, test the Gemini call locally with `curl` before deploying
- The manual "Reply as FogWatcher" menu is your integration test — one click, check logs

## Devvit Platform Constraints

- Node 22+ required (for `--experimental-strip-types`)
- Bundle format must be CJS (esbuild `format: "cjs"`)
- HTTP fetch limited to allowlisted domains only
- AI providers restricted to OpenAI and Gemini
- `onCommentCreate` can fire more than once per comment — always dedup
- Redis is namespaced per installation (per-subreddit)
- `isSecret: true` on form fields only works with `SettingScope.App`, not regular forms
- `npm run deploy` auto-bumps version in `package.json`
