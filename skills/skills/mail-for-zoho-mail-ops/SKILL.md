---
name: mail-for-zoho-mail-ops
role: satellite
ambient: true
description: mail-for-zoho-specifieke mail-ops-feiten.
details: Chains up to company-ops-meta voor procedure, invarianten en safety gates.
use:
- "zoho mail"
- "inbox check"
- "mail triage"
extends: company-ops-meta
chains:
  skills:
  - company-ops-meta
invocable-by:
- user
- agent
- subagent
disable-model-invocation: false
context:
  project_types: []
  file_patterns: []
  tools: []
  repos: ['/home/sofie/mail-for-zoho']
  signals: []
owner: chefgroep
domain: company-ops
risk: read-only
last_reviewed: '2026-08-08'
---

# mail-for-zoho — mail-ops

- Officiële Zoho MCP server; altijd live mailbox account-ids ontdekken.
- Veiligheid: nooit send/reply/forward/delete/trash/purge tenzij expliciet gereviewd + bevestigd.
- Plek: `skills/zoho-mail/` (vervangen door satellite).

Procedure, invarianten en gates: `mail-ops-meta`.
