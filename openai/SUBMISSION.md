# OpenAI Plugin Directory submission — Mail for Zoho

This directory is the review packet for publishing Mail for Zoho as an unofficial open-source plugin backed by Zoho's official MCP service.

## Submission positioning

**Name:** Mail for Zoho  
**Publisher:** OnlineChefGroep  
**Category:** Productivity  
**Tagline:** Read, search and safely organize authorized Zoho Mail inboxes.  
**Affiliation:** Unofficial open-source integration; not affiliated with or endorsed by Zoho or OpenAI.

## User value

Zoho already operates the MCP server and OAuth flow, but users currently have to configure a custom app manually. This plugin packages safe mail workflows and requests a managed app template so an administrator can enter the workspace-specific Zoho MCP URL once, review it and publish the resulting app. Members then connect through Zoho OAuth and use the app normally.

OnlineChefGroep is not in the data path:

```text
ChatGPT -> Zoho MCP -> Zoho Mail API
```

## Review scope

Release 1 is intentionally narrow:

- discover authorized mail accounts and folders;
- list and search messages;
- read message content and attachment metadata;
- mark read/unread and flag/unflag;
- produce a reply draft in ChatGPT without sending it.

The repository does not proxy or filter MCP calls. Reviewers must configure the upstream Zoho server with only the approved tools and review ChatGPT action controls. The live verifier fails when the connected tool surface contains send, reply, forward, delete, trash or purge operations.

## Required submission artifacts

- [x] MIT license
- [x] affiliation and trademark notice
- [x] plugin manifest
- [x] generic Zoho Mail skill
- [x] hardened MCP launcher for local/Codex validation
- [x] protected-config parser and runtime-isolation tests
- [x] pinned GitHub Actions and protected remote-smoke workflow
- [x] privacy notice
- [x] terms of use
- [x] security policy
- [x] support channel
- [x] managed app-template specification
- [x] machine-readable submission payload
- [x] safety and routing eval set
- [x] static repository validator
- [x] live MCP handshake and tool-surface validator
- [ ] clean source imported into a fresh public repository
- [ ] privacy and terms URLs verified without authentication
- [ ] `zoho-remote-smoke` environment configured with required reviewers
- [ ] secret-backed smoke test passes on the exact public release commit
- [ ] OpenAI creates the real app-template/platform record
- [ ] real app/template ID added only after assignment
- [ ] directory submission completed in the OpenAI publisher surface
- [ ] reviewer feedback resolved

## Listing copy

### Short description

Read, search and safely organize authorized Zoho Mail inboxes through Zoho's official MCP server.

### Long description

Mail for Zoho is an unofficial open-source plugin that connects ChatGPT or Codex directly to Zoho's official remote MCP service. It helps users discover authorized mailboxes, search folders and messages, read threads and attachment metadata, and perform low-risk read-state or flag updates. The plugin does not proxy mailbox traffic or store Zoho OAuth tokens. The initial release requires the upstream Zoho server to exclude sending and destructive mail tools.

### Starter prompts

1. Summarize the actionable mail in my Zoho inbox.
2. Find the latest Zoho Mail thread about a project and explain what changed.
3. Draft a reply to this Zoho Mail thread without sending it.

## Reviewer test procedure

1. Configure a Zoho MCP server with only the approved Mail tools.
2. Connect the app with OAuth.
3. Run the safe prompts in `openai/evals.json`.
4. Confirm mailbox IDs are discovered live rather than hardcoded.
5. Confirm the app does not request a password or reveal the MCP URL.
6. Confirm outbound and destructive actions are absent or disabled.
7. Test instruction-like email content and confirm it is summarized rather than executed.
8. Rotate/revoke the Zoho MCP URL and confirm access stops.

## Release command

```bash
npm test
npm run verify:remote
```

The second command requires a protected `ZOHO_MCP_URL`. Neither command prints that URL.

## Platform handoff

OpenAI must create the managed app-template record and supply the actual app or template ID. Until then, `.app.json` must remain absent. `openai/submission.json` is an internal review payload, not a claim that OpenAI has registered the app.
