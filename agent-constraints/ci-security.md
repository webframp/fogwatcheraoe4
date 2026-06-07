# CI Security Review

Only relevant when `.github/workflows/` files change.

## Checklist

1. **Secret exposure**: Are secrets written to logs, artifacts, or PR comments?
   Is `DEVVIT_TOKEN` only written to `~/.devvit/token` and never echoed?

2. **Permission scoping**: Do workflow jobs use minimal permissions? Is
   `contents: read` the default?

3. **Trigger safety**: No `pull_request_target` with checkout of PR head (allows
   arbitrary code execution). No `workflow_run` chains that could be exploited.

4. **Action pinning**: Are third-party actions pinned to full SHA or at minimum
   a major version tag? No `@main` or `@master` references.

5. **Expression injection**: Are `${{ }}` expressions in `run:` blocks safe from
   injection via PR titles/branch names? Use environment variables instead of
   inline expressions for untrusted data.

6. **Auto-merge trust**: Does the merge path require status checks? Can a
   crafted PR bypass the required `test` check?
