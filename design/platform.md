# Platform Constraints (Devvit 0.13)

## Runtime

- Node 22+ required (for `--experimental-strip-types`)
- Server bundle must be CJS (`esbuild format: "cjs"`)
- Server entry point: `dist/server/index.js`
- No persistent processes — each request is a cold or warm invocation

## Authentication

- Devvit handles Reddit OAuth automatically via the `reddit` permission
- No way to extract tokens for external use
- App acts as its own Reddit identity (u/fogwatcheraoe4)

## HTTP Fetch

- Only allowlisted domains can be fetched
- AI providers restricted to: `api.openai.com`, `generativelanguage.googleapis.com`
- 30-second timeout on all fetch calls
- Must declare domains in `devvit.json` under `permissions.http.domains`

## Redis

- Namespaced per installation (per-subreddit)
- 500MB storage limit per installation
- No key listing — must know key names
- Supports: get/set, hashes, sorted sets, transactions, expiration
- No pipelining, no Lua scripts

## Triggers

- `onCommentCreate` can fire more than once per comment — always dedup
- `onPostSubmit` fires for new posts
- Trigger endpoints must start with `/internal/`
- Payloads include full comment/post data + author info

## Menu Items

- Appear in Reddit's context menus (comment, post, or subreddit level)
- `forUserType: "moderator"` restricts visibility
- Handler returns `UiResponse` (toast, form, or navigation)
- Forms require declaration in `devvit.json` under `forms`

## Forms

- `isSecret: true` on form fields only works with `SettingScope.App` — not
  regular forms returned from menu handlers
- Form submission handlers receive the field values as the request body

## Settings

- `devvit.json` → `settings.global` declares app-scoped settings
- Reading via `settings.get()` requires the Devvit Blocks runtime RPC
- **Does not work with raw HTTP server pattern** — use Redis instead

## Deployment

- `npm run deploy` → builds + uploads + auto-bumps version
- `devvit playtest` → installs dev version on a test subreddit with live reload
- `devvit logs r/SUBREDDIT --since=Nm` → stream logs
- Default playtest subreddit is auto-created on first deploy
