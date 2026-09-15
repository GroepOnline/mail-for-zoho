# Mail for Zoho

An unofficial open-source OpenAI plugin and safety package for Zoho's official Mail MCP service.

```text
ChatGPT or Codex -> Zoho official MCP service -> Zoho Mail APIs
```

OnlineChefGroep is not in the mailbox data path. This project does not operate a proxy, receive Zoho OAuth tokens, store mailbox content or embed generated Zoho MCP URLs.

> Mail for Zoho is not affiliated with or endorsed by Zoho Corporation or OpenAI.

## What this solves

Zoho already provides the remote MCP server and its OAuth authorization flow. This repository provides a reusable ChatGPT/Codex package with safe workflow instructions, a reviewed capability boundary, validation and a managed-app submission packet.

A managed ChatGPT app or template is still a platform object. The repository intentionally contains no `.app.json`, app ID or template ID until OpenAI creates and assigns the real record.

## Package contents

- `.codex-plugin/plugin.json` — discovery and interface metadata;
- `.mcp.json` — local/Codex launcher using the hardened Node wrapper;
- `scripts/runtime-security.mjs` — protected config parsing, endpoint validation, child-environment isolation and redaction;
- `skills/zoho-mail/SKILL.md` — inbox routing, live mailbox discovery and safety workflow;
- `chatgpt/tool-policy.json` — reviewed allow/deny contract and explicit enforcement boundary;
- `openai/submission.json` — machine-readable review payload;
- `openai/APP_TEMPLATE.md` — managed-template requirements;
- `openai/SUBMISSION.md` — directory submission checklist and listing copy;
- `openai/evals.json` — routing, privacy, injection and destructive-action evals.

## Capability baseline

Release 1 supports mailbox and folder discovery, bounded message listing and search, message/thread reading, attachment metadata, mark read/unread, flag/unflag and drafting reply text in ChatGPT without sending.

Sending, replying, forwarding, deleting, trashing, purging, mailbox administration, delegation and security-setting changes are forbidden by the approved baseline.

The repository does **not** proxy or filter MCP tools at runtime. Enforce the baseline by selecting only approved tools on the Zoho MCP server, reviewing ChatGPT action controls, and running `npm run verify:remote` before publication and after every upstream tool change.

## Managed ChatGPT setup

The intended installation flow is:

1. An administrator creates or selects a Zoho MCP server and enables only the approved Mail tools.
2. Zoho generates a unique secure MCP URL.
3. The administrator installs Mail for Zoho and configures that URL as a masked secret.
4. The administrator scans and reviews the tool surface and action controls before publishing the workspace app.
5. Authorized users connect through Zoho's OAuth flow.

See [`openai/APP_TEMPLATE.md`](openai/APP_TEMPLATE.md). Publishing the managed app and assigning its real ID require OpenAI's platform or publisher flow and cannot be simulated in Git.

## Direct custom connection

For development or a personal custom app:

1. Create or select a Zoho MCP server.
2. Add only the required Zoho Mail tools.
3. Copy the unique URL from Zoho MCP Console.
4. Store it outside Git as `ZOHO_MCP_URL` or in the protected config file documented in `.env.example`.
5. Create a custom remote MCP app in a supported ChatGPT surface and choose OAuth.

Detailed checks are in [`chatgpt/INSTALL.md`](chatgpt/INSTALL.md).

## Local bridge security

The optional local/Codex bridge is pinned to `mcp-remote@0.1.37`. The protected config file is parsed as data and never sourced as shell. It must be a non-symlink regular file with mode `0600` or stricter and may contain only `ZOHO_MCP_URL` (a legacy `MCP_REMOTE_VERSION` line is ignored). Default single-account mode resolves `ZOHO_MCP_URL`, then `ZOHO_MCP_ENV`, then `~/.config/mail-for-zoho/env`. Profile mode uses `~/.config/mail-for-zoho/profiles/<slug>/env` and an isolated `MCP_REMOTE_CONFIG_DIR`. The launcher spawns `process.execPath` with `npx-cli.js` (never `npx.cmd`) and redacts endpoints from stderr.

The launcher passes a minimal environment to `npx`, excludes unrelated credentials and code-injection variables, disables npm lifecycle scripts and fixes the npm registry. The endpoint remains visible in the bridge process arguments, so do not use the local bridge on an untrusted shared host.

## Multiple mailboxes and identities

There are two different multi-account cases:

1. One authorized Zoho identity can return several mailbox accounts. The assistant always calls `ZohoMail_getMailAccounts`, maps mailbox addresses to live `accountId` values and selects automatically only for one returned account or one exact mailbox-address match. Otherwise it lists the available mailbox identities instead of guessing. Results and low-risk mutations stay scoped to one account and retain mailbox provenance.
2. Two independent Zoho identities require two independent MCP server connections. Each connection uses its own Zoho-generated MCP URL and OAuth cache. Grants, tokens, account IDs and message results are never combined.

For clients such as Cursor that support multiple MCP server entries, copy [`examples/cursor.multi-account.mcp.json`](examples/cursor.multi-account.mcp.json). Create one protected file per profile:

```text
~/.config/mail-for-zoho/profiles/work/env
~/.config/mail-for-zoho/profiles/personal/env
```

Each file must be a non-symlink regular file with mode `0600` and contain only one unquoted `ZOHO_MCP_URL=...` line. Start a profile with `node scripts/run-local.mjs --profile work`. Profile names accept only lowercase letters, digits and single hyphens.

The current managed ChatGPT template has one `zoho_mcp_url` field. Independent multi-login support is therefore guaranteed only in clients that support multiple MCP server connections.

## Verification

```bash
npm test

export ZOHO_MCP_URL='RETRIEVE_FROM_A_SECRET_STORE'
npm run verify:remote
```

`npm test` validates plugin metadata, submission artifacts, public-source hygiene, pinned Actions, policy truthfulness, runtime isolation, config-file safety and the absence of embedded credentials or fabricated OpenAI IDs. `verify:remote` performs a sanitized MCP handshake and validates the live tool surface without printing the endpoint.

## Publishing

This source tree is intended to be imported into a **fresh public repository without the private repository's Git history**. Do not make the private operational repository public as-is.

Before submission:

- verify privacy, terms and support URLs work without authentication;
- configure required reviewers on the `zoho-remote-smoke` GitHub environment before storing its secret;
- run the static and live verification suites on the exact release commit;
- create the real OpenAI app/template record;
- add `.app.json` only after OpenAI supplies a real app ID.

See [`openai/SUBMISSION.md`](openai/SUBMISSION.md), [`PRIVACY.md`](PRIVACY.md), [`TERMS.md`](TERMS.md), [`SECURITY.md`](SECURITY.md), [`SUPPORT.md`](SUPPORT.md) and [`NOTICE`](NOTICE).

Product tags, GitHub Release artifacts and `run-local --version` identity: [`docs/release.md`](docs/release.md).
