# Architecture Decisions

## ADR-001: Raw Node HTTP Server

**Context:** Devvit 0.13 supports Hono, Express, or raw `http.createServer`.

**Decision:** Raw Node HTTP server with manual routing.

**Rationale:** No framework overhead. The app has ~5 routes. A router adds
dependencies without reducing complexity at this scale.

## ADR-002: Redis for API Key Storage

**Context:** Devvit offers app-level settings (`settings.global` in
devvit.json) and Redis.

**Decision:** Store the Gemini API key in Redis via a mod menu form.

**Rationale:** App-level settings require the Devvit Blocks runtime RPC
handlers (`ValidateAppForm`). The raw HTTP server pattern doesn't register
those handlers. Redis works universally. The key is not accessible to other
mods through any Reddit UI.

## ADR-003: Gemini 2.5 Flash

**Context:** Devvit restricts HTTP fetch to allowlisted domains. Only OpenAI
(`api.openai.com`) and Gemini (`generativelanguage.googleapis.com`) are
permitted AI providers.

**Decision:** Gemini 2.5 Flash.

**Rationale:** Free tier covers r/aoe4's comment volume. OpenAI has no free
tier for API usage.

## ADR-004: Single LLM Call (Analysis + Generation)

**Context:** Could separate classification (is this toxic?) from generation
(write a FogWatcher reply) into two calls.

**Decision:** Single call that both classifies and generates.

**Rationale:** Lower latency, lower cost, simpler code. The model receives the
persona as system instruction and returns structured JSON containing both the
verdict and the reply text.

## ADR-005: Dedup After Successful Analysis

**Context:** `onCommentCreate` can fire multiple times per comment. Need
idempotency.

**Decision:** Mark as processed only after Gemini returns successfully, not
before the API call.

**Rationale:** If we mark before and the call fails (429, timeout), the comment
is permanently blocked from retry for 24h. Marking after means transient
failures allow natural retry on the next trigger fire.

## ADR-006: Manual Menu Bypasses Dedup

**Context:** A mod clicking "Reply as FogWatcher" should always work, even if
the auto-trigger already processed the comment.

**Decision:** The menu handler skips the dedup check entirely.

**Rationale:** The mod made a deliberate choice. The auto-trigger may have
processed it during a quota exhaustion (analysis failed, but dedup wasn't set
in that case anyway) or the mod wants a fresh analysis. Either way, honor the
human intent.

## ADR-007: node:test for Testing

**Context:** Need a test framework. Options: Jest, Vitest, node:test.

**Decision:** Node's built-in `node:test` runner.

**Rationale:** Zero dependencies. Node 22 includes it. The test suite is small
and doesn't need mocking frameworks or snapshot testing.
