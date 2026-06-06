# Domain Model

## Bounded Context

**Comment Moderation** — the single bounded context. Observes content, evaluates
it against community standards, and optionally responds.

Future contexts (if the app grows) should remain separate:
- Strike Tracking — counting infractions per user, escalation
- Modqueue Triage — approve/remove decisions on reported content
- Analytics — aggregating moderation patterns over time

## Ubiquitous Language

| Term | Definition |
|------|------------|
| Analysis | A single Gemini API call evaluating content, returning a structured verdict |
| Flagged | Analysis returned `action: "reply"` with confidence ≥ threshold |
| Confidence | 0.0–1.0 score: how certain the model is that moderation is needed |
| Threshold | Minimum confidence (0.7) required before the bot acts |
| Dedup | Redis key (`processed:{thingId}`) with 24h TTL preventing duplicate processing |
| Persona | The FogWatcher character — system prompt governing tone and vocabulary |
| Thing ID | Reddit's prefixed identifiers: `t1_` (comment), `t3_` (post), `t5_` (subreddit) |
| Reply | Generated FogWatcher response text posted as a comment |

## Entities

**ProcessedContent** — identified by Thing ID. Lifecycle: created after
successful analysis, expires after 24h. Represented as a Redis key.

## Value Objects

**AnalysisResult** — `{ action, confidence, reply, reason }`. Immutable output
of evaluation. No identity; two analyses with identical fields are
interchangeable.

**Persona** — the system prompt configuration. Immutable per deployment.

## Domain Service

**`analyzeComment(body, apiKey) → AnalysisResult`** — the core domain operation.
Stateless. Takes content, produces a verdict. Encapsulates LLM interaction.

## Application Services

| Service | Responsibility |
|---------|---------------|
| `onCommentCreate` | Full auto-moderation flow for comments |
| `onPostSubmit` | Full auto-moderation flow for text posts |
| `onMenuFogwatcherReply` | Manual override — skips dedup, respects analysis |

## Anti-Corruption Layers

| Module | Isolates |
|--------|----------|
| `gemini.ts` | LLM provider API format. Swap models/providers here only. |
| `persona.ts` | Character configuration. Change voice without touching logic. |
| `logic.ts` | Gating rules. Adjust threshold/conditions without touching I/O. |
| `server.ts` | Platform coupling. Devvit routing, Redis, Reddit API contained here. |
