# Release route

Declared version source: `package.json` `version`. `.codex-plugin/plugin.json` `version` must match.

1. Bump both version fields to the next `X.Y.Z`.
2. Merge that commit to `origin/main`.
3. Tag the exact main commit `vX.Y.Z` (tag equals the source version).
4. Tag push runs `.github/workflows/release.yml`: it re-checks tag == sources, confirms the tag commit is an ancestor of `origin/main`, runs `npm pack`, writes `SHA256SUMS`, and creates the GitHub Release with those assets.
5. Visible identity: `node scripts/run-local.mjs --version` prints `{ version, source_sha }`. `version` comes from `package.json`. `source_sha` is set only when `MAIL_FOR_ZOHO_BUILD_SHA` is a 40-character SHA (release.yml sets it to the tag commit); otherwise it is `null`. This package launches Zoho's official MCP server and does not own `serverInfo.version`.

`workflow_dispatch` with input `tag` backfills the same checks at that tag's commit. Existing `publish.yml` still publishes to npm; this route only adds GitHub Release evidence.

This document does not create a tag or GitHub Release.
