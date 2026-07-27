# Privacy notice — Mail for Zoho

Last updated: 2026-07-26

Mail for Zoho is an unofficial open-source plugin and configuration package maintained by OnlineChefGroep. It connects ChatGPT or another compatible MCP client directly to a Zoho MCP server configured and operated by Zoho.

## Data flow

The project does not operate a mailbox proxy. When the app is connected, mailbox requests and responses flow between the user's ChatGPT/OpenAI client and Zoho's official MCP service. Depending on the tools selected in Zoho and the permissions granted by the user, responses may contain mailbox metadata, folders, sender and recipient fields, subject lines, message bodies and attachment metadata.

## Data stored by OnlineChefGroep

OnlineChefGroep does not receive or store:

- Zoho passwords;
- Zoho OAuth access or refresh tokens;
- generated Zoho MCP endpoint URLs;
- mailbox messages or attachments;
- ChatGPT conversation content produced through the app.

This GitHub repository contains only open-source configuration, workflow instructions, validators and optional local/fleet launchers.

## Zoho and OpenAI processing

Zoho processes requests under the user's Zoho account, selected MCP tools and Zoho terms. ChatGPT/OpenAI processes tool requests and returned content according to the user's ChatGPT plan, workspace settings, data controls and applicable OpenAI terms. Users should review both providers' privacy and retention settings before connecting sensitive mailboxes.

## User controls

Users or workspace administrators can disable or remove the app in ChatGPT. Zoho access can also be revoked from the Zoho MCP console. Because the generated Zoho MCP URL is a credential, users should rotate it immediately if it is exposed.

## Security defaults

The published plugin baseline is inbound-first. It supports mailbox discovery, folder and message search, message reading, attachment metadata, read-state changes and flags. Send, reply, forward, delete, trash and purge actions are not authorized by the plugin's default policy.

## Contact

Privacy and security questions: `chefadmin@chefgroep.online`.
