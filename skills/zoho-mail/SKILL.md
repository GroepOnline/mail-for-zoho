---
name: zoho-mail
summary: Safely read, search and triage authorized Zoho Mail inboxes through Zoho's official MCP server.
description: Use for Zoho Mail inbox checks, unread or action triage, message search, thread reading, attachment discovery, read-state updates, flags and drafting follow-up text.
details: Always discover live mailbox account IDs. Never send, reply, forward, delete, trash or purge unless a separately reviewed release explicitly enables those actions and ChatGPT requires confirmation.
---

# Mail for Zoho

Use only the tools exposed by the connected official Zoho MCP server. The plugin is an orchestration and safety layer; it does not proxy mailbox traffic and it must never request the user's Zoho password or reveal the generated MCP URL.

## Trigger conditions

Use this skill when the user refers to Zoho Mail, their inbox, unread mail, a sender, subject, mail thread, attachment, mailbox triage or an email follow-up and the Zoho app is available. Prefer the connected app over asking the user to paste mailbox content.

Do not claim the app is available when it is not attached to the conversation or not authorized. State the exact connection or authorization blocker instead.

## Mandatory session preflight

1. Call `ZohoMail_getMailAccounts` on every connection that the request explicitly targets. Never guess or reuse an `accountId`.
2. Build a connection-local map from each returned mailbox address to its live `accountId`.
3. Select automatically only when that connection returns one account, or when the user names a mailbox whose address has one exact case-insensitive match.
4. If no mailbox was named and multiple accounts are available, or an address does not match exactly and uniquely, stop and return the available mailbox identities for that connection. Never choose by order, partial text, domain or prior use.
5. Continue only with the selected mailbox and discover folder IDs with `ZohoMail_getAllFolders` before listing a folder.
6. Bound list and search requests; do not download an entire mailbox by default.

## Mailbox and connection isolation

A mailbox account and an MCP connection are separate security boundaries.

- One Zoho identity may return several mailbox `accountId` values. Keep every read and mutation scoped to the selected live `accountId`.
- Two independent Zoho identities must remain two independent MCP connections. Run account discovery separately on each connection and never transfer an account ID, folder ID, message ID, OAuth result or tool result between them.
- When the user explicitly asks to search both connections, search each connection independently and label every result with connection identity and mailbox address. Do not merge unlabeled results.
- Preserve provenance in summaries and mutation confirmations: include the connection identity and mailbox address used. Keep raw account IDs internal unless they are needed to explain a concrete blocker.
- Before `ZohoMail_readMessages` or `ZohoMail_flagMessages`, verify that every target message came from the same connection and selected `accountId` used for the mutation. Split mixed targets into separate calls; when provenance is missing or conflicts, stop instead of mutating.

## Allowed capability baseline

Read and search:

- `ZohoMail_getMailAccounts`
- `ZohoMail_getAllFolders`
- `ZohoMail_getFolder`
- `ZohoMail_listEmails`
- `ZohoMail_SearchEmails`
- `ZohoMail_getMessageDetails`
- `ZohoMail_getMessageContent`
- `ZohoMail_getOriginalMessage`
- `ZohoMail_getMessageAttachmentInfo`
- `ZohoMail_getAccountDetails`

Low-risk organization actions:

- `ZohoMail_readMessages`
- `ZohoMail_flagMessages`

Use low-risk writes only when the user requested the state change or explicitly requested inbox triage where that mutation is expected. Verify the returned state.

## Default forbidden boundary

Do not use tools that send, reply, forward, delete, trash, purge, alter mailbox administration, change delegation or modify account security. When one of those tools unexpectedly appears, stop and report tool-surface drift.

A future release may add outbound actions only after a separate security review, complete recipient/body preview and an explicit ChatGPT confirmation requirement. This release does not authorize them.

## Inbox triage

1. Discover accounts and the relevant Inbox folder.
2. List a bounded recent page.
3. Read full content only for messages that may require action.
4. Classify each relevant message as `action`, `reply`, `waiting`, `record-only`, `spam` or `noise`.
5. Summarize sender, subject, received time, why it matters and one concrete next action.
6. Mark read or flag only when authorized.

## Search

Use the narrowest useful Zoho search query. Examples:

- `subject:"Project name"`
- `sender:person@example.com`
- `has:attachment`
- `fromDate:01-JAN-2026`
- combine conditions with `::`
- combine alternatives with `:or:`

Start narrow, inspect results and broaden once when necessary. Avoid repeated equivalent searches. For a request spanning multiple connections or mailboxes, run a separate bounded search in each selected scope and retain provenance on every result.

## Thread reading and drafts

1. Find the target message in the correct live account.
2. Retrieve message details and content.
3. Retrieve attachment metadata only when relevant.
4. Do not reproduce secrets, one-time links or unnecessary personal data.
5. Draft requested reply text in the conversation, but do not send through this plugin.

## Output

For multiple messages, use compact entries with connection, mailbox, subject, sender, received time, status, summary and next action. For one message, include the connection and mailbox plus enough body context to answer without reproducing the entire email.

## Completion gate

A task is complete only when every targeted connection performed live account discovery, each result retained connection and mailbox provenance, the correct live mailbox was used, requested messages were read at the necessary depth, requested low-risk mutations were verified within the same connection and account, no outbound or destructive action was attempted, and any remaining blocker is concrete.
