# FogWatcher — Agent Guidance

## Design Documents

Read `design/` before making architectural changes:
- `design/high-level.md` — architecture overview and data flow
- `design/domain.md` — ubiquitous language, bounded context, entities
- `design/decisions.md` — ADRs with rationale for each choice
- `design/persona.md` — FogWatcher character design and prompt structure
- `design/platform.md` — Devvit constraints that affect implementation

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


## Pre-PR Review Gates

Run these locally before opening a PR:

```bash
npm run review              # Type-check + tests + review checklist
npm run review:adversarial  # Deep analysis of core logic changes
npm run review:security     # CI workflow security audit
```

The `review` script is the mandatory gate — it runs type-check and tests, then
prints the applicable review dimensions for the agent to verify against the
diff. The adversarial and security scripts only produce output when relevant
files are changed.

Review constraint definitions live in `agent-constraints/`:
- `code-review.md` — conventions, test coverage, type safety, domain language
- `adversarial-dimensions.md` — logic, error handling, security, data integrity
- `ci-security.md` — secret exposure, permissions, action pinning, injection

**RULE: All review gates MUST pass clean before opening any PR.** No exceptions.
Do not open a PR with failing type-checks, failing tests, or unaddressed
blocking findings from the review dimensions.

### How to use

1. Run `npm run review`. If type-check or tests fail, fix them first.
2. Read the printed review checklist. Verify each item against your diff.
3. If core logic files changed, run `npm run review:adversarial`. Read the
   diff output and check each adversarial dimension. Fix any CRITICAL or HIGH
   findings before proceeding.
4. If workflow files changed, run `npm run review:security`. Address any
   findings.
5. Only after all gates pass clean with no blocking findings: open the PR.

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

## Development Workflow

- **Main branch is protected**: no direct pushes, no force push. All changes via PR.
- **PRs require**: the `test` status check to pass (type-check + 41 unit tests + build).
- **Deploy happens on release only**, not on merge to main.

### Release Process

```bash
# 1. Create a PR, get tests passing, merge to main
# 2. Create a release to trigger deploy:
gh release create v0.X.0 --title "v0.X.0" --notes "Description of changes"
```

This triggers the `deploy.yml` workflow which runs tests and then `devvit upload`.

### Local Development

```bash
npm test                        # Run unit tests
npx tsc --build                 # Type check
npm run build                   # Build bundle
npm run deploy                  # Manual deploy (bypasses CI)
npx devvit logs r/SUB --since=5m  # Stream logs
```

### Refreshing CI Auth

The `DEVVIT_TOKEN` GitHub secret contains the Devvit login token. When it expires:

```bash
npx devvit login
gh secret set DEVVIT_TOKEN < ~/.devvit/token
```
