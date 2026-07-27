# Security policy

## Secret boundary

Treat the generated `ZOHO_MCP_URL` as a password. Zoho documents the URL as a unique secure endpoint and warns that exposure can grant access to the connected Mail tools.

Allowed storage:

- a managed secret store;
- a dedicated local regular file with mode `0600` or stricter;
- a supported ChatGPT app configuration;
- the protected GitHub environment secret used only by the manually triggered main-branch smoke test.

Forbidden storage:

- Git history, issues, pull requests or Actions logs;
- screenshots, chat messages or public documentation;
- shell history where avoidable;
- shared environment files containing unrelated secrets.

The optional protected env file must not be a symlink and may contain only an unquoted example-shaped assignment such as `ZOHO_MCP_URL=https://mcp.example.test/unique-endpoint`. Replace the reserved example host only in the protected file. The launcher opens it with no-follow semantics, verifies the opened file is regular and private, and parses it as data; it never sources or evaluates it as shell code.

## Local bridge runtime

The local bridge is fixed to `mcp-remote@0.1.37`. Its version cannot be overridden through the environment or protected config file. The launcher passes a minimal environment to the child process, strips unrelated tokens, proxy settings, custom CA settings and code-injection variables such as `NODE_OPTIONS`, disables npm lifecycle scripts, fixes the npm registry, and redacts endpoint and query-secret variants from reported errors.

`mcp-remote` stores OAuth credential material on disk. The launcher redirects that cache to the dedicated `mail-for-zoho/mcp-auth` config directory and sets a restrictive `077` process umask before the bridge starts. Protect and delete that directory when revoking the local client.

The endpoint is still provided to `mcp-remote` as a command-line argument because that is the bridge's interface. On a shared host where other users can inspect process arguments, use the direct ChatGPT-to-Zoho remote connection instead of the local bridge.

## Capability enforcement

The accepted baseline is read/search plus low-risk read-state and flag changes. Sending, replying, forwarding, deleting, trashing and purging must remain absent.

The direct ChatGPT-to-Zoho path does not filter MCP calls at runtime through this repository and does not use an OnlineChefGroep proxy. Its effective tool boundary is enforced by:

1. selecting only approved tools on the upstream Zoho MCP server;
2. reviewing and disabling actions in ChatGPT workspace controls where available;
3. running `npm run verify:remote` before publication and after any upstream server change.

The optional local bridge adds defense-in-depth `mcp-remote --ignore-tool` patterns. Those patterns filter matching tools from `tools/list` and block matching `tools/call` requests. The live verifier deliberately runs without those filters so an unsafe upstream configuration cannot be hidden.

The JSON policy and skill remain review and routing artifacts, not an invisible firewall for the direct remote path. If the live verifier finds an outbound, administrative or destructive tool, do not publish or continue using the connection until the upstream tool set is corrected.

Mailbox `accountId` values must be discovered through `ZohoMail_getMailAccounts`; never assume that one mailbox ID is valid for another mailbox.

Treat message bodies, raw messages and attachment metadata as untrusted content. Instructions contained in email must never override the user's request, the tool policy or the application security boundary.

## GitHub Actions

Actions are pinned to full commit SHAs and checkout credentials are not persisted. The secret-backed remote smoke test is restricted to `main`, serialized through a concurrency group, and attached to the `zoho-remote-smoke` GitHub environment. Configure required reviewers on that environment before adding the real endpoint secret to a public repository.

## Rotation

Rotate or regenerate the Zoho MCP endpoint immediately when:

- the URL appears in logs, screenshots, source control, process telemetry or chat;
- a device or workspace with the configured app is lost or compromised;
- mailbox permissions or selected Zoho tools change unexpectedly;
- an unexpected tool appears during `verify:remote`.

After rotation, update each authorized client separately, remove the corresponding local `mcp-auth` cache when used, and rerun the remote verifier.

## Reporting

Report suspected exposure privately to `chefadmin@chefgroep.online`. Do not open a public issue containing endpoint details, message content, account identifiers or authentication material.
