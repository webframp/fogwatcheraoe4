# Adversarial Review Dimensions

Challenge each change across these dimensions:

## Logic and Correctness

Trace every code path. Check edge cases: empty strings, null/undefined fields,
missing Redis keys, Gemini returning unexpected shapes. Does the confidence
threshold comparison use `>=` correctly? Can `shouldReply` ever return true when
it shouldn't?

## Error Handling

What happens when every external call fails? Gemini 429, Gemini 500, Reddit API
down, Redis connection lost. Does the failure propagate gracefully or leave
orphaned state (dedup key set but no reply posted)?

## Security and Prompt Injection

Can a malicious comment body influence the Gemini system prompt or analysis
instructions? Could a crafted comment cause the bot to reveal its API key,
bypass the confidence threshold, or generate harmful content? Does the persona
prompt have sufficient boundaries?

## Data Integrity

Redis state consistency. Can a race condition between trigger fires and manual
menu actions cause double-replies? Is the dedup TTL appropriate? Can the rate
limit counter drift?

## API Contract

Does the code handle every documented Gemini response shape? What about
undocumented ones (empty candidates, missing parts, new fields)? Does
`parseGeminiResponse` fail safely on malformed input?

## Scope and Complexity

Is the change doing too much? Does it match the stated intent? Are there
unnecessary abstractions? Could it be simpler?

## Documentation

Does this change affect behavior described in `design/*.md` or `CLAUDE.md`? If
so, those docs must be updated in the same change.
