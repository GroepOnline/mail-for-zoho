# Managed ChatGPT app-template request

## Objective

Register a managed app template named **Mail for Zoho** that lets a workspace administrator enter one organization-specific Zoho MCP URL once, publish the resulting workspace app, and make the app available to allowed members without requiring those members to create a developer MCP themselves.

The runtime path must remain direct:

```text
ChatGPT or Codex -> Zoho official MCP service -> Zoho Mail APIs
```

OnlineChefGroep must not proxy requests, receive OAuth tokens, store mailbox data or receive the generated endpoint URL.

## Why an app template is required

Zoho generates a unique secure MCP URL for every configured Zoho MCP server. A universal static endpoint therefore cannot be packaged in the plugin. The workspace-specific URL is the organization input that the app template must collect and store as a secret.

## Template fields

### Zoho MCP server URL

- Internal key: `zoho_mcp_url`
- Label: `Zoho MCP server URL`
- Type: secret URL
- Required: yes
- Secret: yes
- Validation: HTTPS remote MCP endpoint
- Display after save: masked
- Logging: forbidden
- Help text: `Create or select a Zoho MCP server, add the required Zoho Mail tools, then copy the unique URL from Zoho MCP Console > Connect.`

No Zoho password, OAuth client ID or OAuth client secret should be requested by this template. Zoho's official MCP service performs OAuth 2.1 authorization after the app connection is created.

## Authentication

- ChatGPT app authentication method: OAuth
- OAuth provider and token maintenance: Zoho MCP
- User authorization: on first connection and when Zoho adds scopes/tools that require reauthorization
- Provider permissions remain authoritative

## Administrator setup flow

1. Open Zoho MCP Console.
2. Create or select a Zoho MCP server.
3. Add the approved Zoho Mail tool set.
4. Choose Authorization on Demand for per-user authorization unless the organization deliberately approves Zoho's shared Connection authorization.
5. Copy the unique MCP URL from the Connect section.
6. Open the Mail for Zoho app template in ChatGPT workspace settings.
7. Paste the URL into the secret field and create a draft.
8. Review discovered tools and action controls.
9. Publish the workspace app and assign access.
10. Test with a low-risk mailbox-search prompt.

## Member experience

After the workspace app is published, an allowed member should:

1. install or open the Mail for Zoho plugin;
2. select Connect for the required app;
3. complete Zoho OAuth;
4. invoke it with `@Mail for Zoho` or by selecting it from the app picker.

Members should not need Developer Mode after the managed workspace app has been published. Invocation still depends on the user's plan, workspace policy, role and supported ChatGPT surface.

## Baseline tool policy

The first directory release is inbound-first. The template must be reviewed against `chatgpt/tool-policy.json` and `openai/submission.json`.

Allowed baseline:

- mailbox and folder discovery;
- message listing, search and reading;
- attachment metadata;
- read/unread and flag/unflag;
- drafting text in ChatGPT without sending.

Not approved in this release:

- send, reply or forward;
- delete, trash or purge;
- mailbox administration, delegation or security-setting changes.

## Platform-owned identifiers

Do not add `.app.json`, an app ID or a template ID until OpenAI has created the corresponding platform object and supplied its real identifier. The repository verifier fails when fabricated identifiers or placeholder app files are introduced.

## References

- OpenAI: ChatGPT app templates — https://help.openai.com/en/articles/20001247-chatgpt-app-templates/
- OpenAI: Plugins in ChatGPT and Codex — https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex
- Zoho: Configure Zoho MCP server — https://www.zoho.com/mail/help/mcp/mcp-server-configuration.html
- Zoho: Connect Zoho Mail MCP with ChatGPT — https://www.zoho.com/mail/help/mcp/mcp-chatgpt.html
