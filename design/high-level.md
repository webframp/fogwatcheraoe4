# FogWatcher

## Purpose

FogWatcher is a Devvit mod bot for r/aoe4 that monitors comments and posts for
toxicity, rule violations, and low-effort negativity. When content warrants
moderation, it replies in-character as a techbro AoE4 veteran who frames
everything through Age of Empires 4 mechanics.

## Architecture

Raw Node HTTP server running on Devvit's platform. No framework (not
Hono/Express). Triggers and menu actions route through a single `onRequest`
handler that dispatches by URL path.

## Data Flow

```
Reddit Event → Devvit Trigger → server.ts (routing)
  → logic.ts (gating: skip self, check dedup)
  → gemini.ts (analysis: evaluate + generate reply)
  → logic.ts (threshold check)
  → reddit.submitComment (post reply)
  → redis (mark processed)
```

## Key Decisions

See [./decisions.md] for architecture decision records.

## Domain Model

See [./domain.md] for ubiquitous language, bounded context, and entity
definitions.

## Persona

See [./persona.md] for the FogWatcher character design and prompt engineering
approach.

## Platform

See [./platform.md] for Devvit-specific constraints and patterns.
