# Install as a private ChatGPT MCP app

## What ChatGPT needs

ChatGPT connects to a **remote MCP endpoint**. It cannot use the SSH/stdio fleet command directly. For this repository, the install endpoint is the official remote Zoho MCP URL stored as `ZOHO_MCP_URL`.

The repository is install-ready, but the ChatGPT account or workspace must expose Developer mode and custom MCP app creation. Repository files cannot bypass product-plan or workspace-admin restrictions.

Official OpenAI setup reference:

- https://help.openai.com/en/articles/12584461
- https://help.openai.com/en/articles/11487775-connectors-in

## Preflight

Run locally or in the manual GitHub Actions workflow:

```bash
export ZOHO_MCP_URL='RETRIEVE_FROM_SECRET_STORE'
npm test
npm run verify:remote
```

Accept only when:

- the endpoint is HTTPS;
- MCP initialization succeeds;
- all required tools in `app-metadata.json` exist;
- no send/reply/delete/trash tools exist;
- `ZohoMail_getMailAccounts` can be called after installation;
- mailbox IDs are discovered live rather than hardcoded.

When one authorization returns several mailboxes, select automatically only if one account is returned or the user supplies one exact mailbox address that matches uniquely. Otherwise list the available mailbox identities and ask the user to choose. Keep connection and mailbox provenance on every result and mutation.

## Create the app in ChatGPT web

1. Open **Settings → Apps → Advanced settings** and enable Developer mode when available.
2. Choose **Create app** or **Create custom MCP connector**.
3. Name: `Mail for Zoho`.
4. Description: copy `short_description` from `app-metadata.json`.
5. Endpoint: paste the secret value of `ZOHO_MCP_URL` directly from the secret store. Never paste it into GitHub, Linear, Notion, chat messages or screenshots.
6. Authentication: use the mode supported by the generated Zoho endpoint. If the URL is the generated authenticated capability endpoint, do not invent separate OAuth credentials.
7. Run **Scan tools**.
8. Compare the scanned list with `tool-policy.json`.
9. Do not publish workspace-wide until the smoke test below passes.

## Smoke test after installation

In a new ChatGPT web conversation with the app enabled:

1. Call `ZohoMail_getMailAccounts`.
2. Confirm only the expected authorized mailbox identities appear.
3. If several appear, verify that an unspecified mailbox produces a choice rather than an automatic selection.
4. Call `ZohoMail_getAllFolders` for one discovered account ID.
5. List a small Inbox page.
6. Read one non-sensitive test message and confirm the result identifies its connection and mailbox.
7. Confirm no outbound or destructive tools are available.

Do not claim access to a mailbox that live discovery did not return.

## Independent Zoho identities

Two Zoho identities are two separate MCP connections, not two account IDs on one connection. Each connection must use its own Zoho-generated MCP URL and isolated OAuth/cache directory. Never copy an OAuth grant, account ID, folder ID or message ID between connections.

Clients that support multiple MCP server entries can use [`../examples/cursor.multi-account.mcp.json`](../examples/cursor.multi-account.mcp.json). For each profile:

1. Create `~/.config/mail-for-zoho/profiles/<profile>/env`.
2. Put only the profile's unquoted `ZOHO_MCP_URL=...` value in that file.
3. Set mode `0600` and ensure the file is not a symlink.
4. Start it with `node scripts/run-local.mjs --profile <profile>`.

Profile mode intentionally ignores the global endpoint variables so two entries cannot silently share one endpoint. It also sets a distinct `MCP_REMOTE_CONFIG_DIR` for each profile.

The current managed ChatGPT app template exposes one `zoho_mcp_url` field. It cannot guarantee two independent logins in one managed installation. Independent multi-login support is currently guaranteed only for clients that support multiple MCP server connections.

## Plugin-directory path

This repository alone does not create a public or directory-listed ChatGPT plugin. Directory distribution requires a separate OpenAI app/plugin submission and approval. `app-metadata.json`, `PRIVACY.md`, `SECURITY.md` and `TERMS.md` are the source packet for that future submission.
