# Code Review Conventions

## What to Check

1. **Conventions**: Does the code follow patterns established in `CLAUDE.md` and
   `design/*.md`? Are anti-corruption layers respected (gemini.ts for LLM,
   persona.ts for prompts, logic.ts for gating, server.ts for routing)?

2. **Test coverage**: Are new behaviors tested? Are existing tests still valid
   after the change? Does `npm test` pass?

3. **Type safety**: Does `npx tsc --build` pass with no errors? Are there unsafe
   `any` casts that could be avoided?

4. **Domain language**: Are new concepts named using the ubiquitous language from
   `design/domain.md`? Are existing terms used consistently?

5. **Platform constraints**: Does the change respect Devvit limitations documented
   in `design/platform.md`? (CJS bundle, allowlisted domains, Redis limitations,
   trigger idempotency)

## Severity Levels

- **Blocking**: Logic bugs, missing error handling on external calls, security
  issues, broken tests, undocumented breaking changes
- **Suggestion**: Style improvements, minor naming issues, optional refactors,
  missing but non-critical tests
