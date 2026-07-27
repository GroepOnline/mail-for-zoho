# Public release and publisher handoff

## Repository release

The repository currently remains private. Before announcing the project or submitting public URLs:

1. Verify `npm test` and the secret-backed `npm run verify:remote` pass.
2. Review the full Git history for accidental credentials.
3. Confirm no generated Zoho MCP URL, OAuth material or mailbox content is present.
4. Change repository visibility to public in GitHub organization settings.
5. Confirm these URLs work without authentication:
   - repository homepage;
   - `PRIVACY.md`;
   - `TERMS.md`;
   - issue tracker/support channel.
6. Create a signed `v0.4.0` release from the audited commit.

Repository visibility cannot be changed by the current GitHub connector and remains a manual organization-admin action.

## OpenAI publisher handoff

The OpenAI Platform API-key project is not the ChatGPT plugin publisher surface. Do not create or embed an OpenAI API key for this integration.

Submit the package through the ChatGPT/OpenAI plugin publisher flow with:

- `.codex-plugin/plugin.json`;
- the public repository URL;
- privacy, terms and support URLs;
- `openai/submission.json`;
- `openai/APP_TEMPLATE.md`;
- `openai/evals.json`;
- evidence from `npm test` and `npm run verify:remote`.

Request a managed app template with one masked administrator input: the unique Zoho MCP server URL. Authentication is OAuth through Zoho's official MCP service.

After OpenAI creates a real platform record:

1. record the assigned app/template identifier in the release issue;
2. add `.app.json` using only the supplied real ID;
3. rerun validation and reviewer tests;
4. publish a new release;
5. complete directory review.

## No-server guarantee

The submitted architecture must remain:

```text
ChatGPT or Codex -> Zoho official MCP service -> Zoho Mail API
```

Do not introduce an OnlineChefGroep proxy, analytics relay or token store into the mailbox request path.
