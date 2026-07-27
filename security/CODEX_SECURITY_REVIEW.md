# Codex Security review — public clean source branch

Date: 2026-07-26  
Repository: `OnlineChefGroep/zoho-mail-mcp`  
Pull request: #5  
Branch: `release/public-clean-source`  
Base commit: `57df983ae193ba82c0ad46fe01bbcc4c7530a210`  
Remediation commit reviewed: `6b11b1a6f7b1604ecbd6db7a03d96e2ce961937d`

## Review status and limitation

This review follows the four-phase security diff-scan workflow published in OpenAI's official `openai/plugins` Codex Security package: threat modelling, finding discovery, finding validation and attack-path analysis.

The Codex Security app runtime was not installed in the reviewing ChatGPT workspace, so this is a manual application of that official methodology rather than an execution of the Codex Security scan engine. There is no official Codex Security scan ID, hidden subagent trace or engine-generated coverage claim associated with this report.

The report covers the branch source and pull-request diff. It does not claim to audit the internals of Zoho, OpenAI, GitHub, npm or the upstream `mcp-remote` service beyond the externally visible integration contracts used here.

## Executive assessment

No embedded Zoho endpoint, OAuth token, private key or common platform token pattern was found on the remediated source tree by the repository gates.

Seven concrete weaknesses were identified and remediated. The highest-impact paths involved executing a protected env file as shell code, allowing environment-controlled runtime package selection, inheriting unrelated process secrets and relying on mutable GitHub Action tags around a secret-backed workflow. The direct ChatGPT-to-Zoho architecture remains intentionally free of an OnlineChefGroep proxy; therefore its tool boundary must still be enforced at Zoho and in ChatGPT action controls. The optional local bridge now adds a second runtime tool-call filter.

The branch is suitable as a **source export candidate**, not as proof that the future public app has completed live authorization, provider review or production deployment. The private repository and its Git history must not be made public as-is.

## Phase 1 — threat model

### Security objectives

- Keep the generated `ZOHO_MCP_URL` confidential.
- Keep local OAuth credential material confidential and revocable.
- Prevent mailbox data from crossing into unrelated logs, tokens or tools.
- Prevent email content from becoming executable assistant instructions.
- Prevent outbound, destructive, administrative or security-changing mail actions in release 1.
- Preserve the direct data path: ChatGPT/Codex to Zoho MCP to Zoho Mail.
- Prevent private fleet material from entering the clean public source tree.
- Keep CI and release workflows reproducible and least-privileged.

### Assets

- The unique Zoho MCP endpoint URL.
- Zoho OAuth access and refresh material cached by clients.
- Mailbox contents and attachment metadata returned by tools.
- Live mailbox and folder identifiers.
- The approved MCP tool surface.
- GitHub environment secret `ZOHO_MCP_URL` used by the manual smoke test.
- Public release metadata and future OpenAI app/template identifiers.

### Trust boundaries

1. User and ChatGPT conversation to the installed app.
2. ChatGPT or local MCP client to Zoho's official remote MCP endpoint.
3. Local Node launcher to the third-party `mcp-remote` package.
4. Local process to protected config and OAuth-cache files.
5. Repository source to GitHub Actions runners and third-party Actions.
6. Untrusted incoming email content to model reasoning and possible tool selection.
7. Private operational repository to the future fresh public repository.

### Relevant attacker capabilities

- A malicious sender can place prompt-injection text, links and deceptive attachment names in email.
- A local user or compromised process can modify environment variables, PATH, npm configuration or a writable config file.
- A repository contributor can change workflows, action versions, policy metadata or validation code.
- A mistaken or compromised administrator can enable unsafe Zoho Mail tools upstream.
- A local user on a shared machine may inspect process arguments.
- A dependency or registry compromise can affect a package fetched at runtime.

## Phase 2 — findings and remediation

| ID | Severity | Finding | Attack path | Remediation | Status |
|---|---|---|---|---|---|
| CS-001 | Medium | Protected env file was sourced as shell code | Write or replace the env file, then execute arbitrary shell commands when the bridge starts | Deleted the shell launcher; added a strict Node parser that accepts only `ZOHO_MCP_URL`, opens with no-follow semantics and checks regular-file type and mode | Fixed |
| CS-002 | Medium | Runtime package and child process were environment-influenced | Override `MCP_REMOTE_VERSION`, PATH, npm config or `NODE_OPTIONS`; execute a different package or preload code while secrets are present | Fixed `mcp-remote@0.1.37`; removed version override; resolved `npx` beside the active Node runtime; created a minimal child environment; removed proxy/custom-CA/code-injection variables; disabled lifecycle scripts and fixed npm configuration | Fixed |
| CS-003 | Medium | CI used mutable Action tags and a broad secret-smoke path | Retag or compromise an Action, retain checkout credentials or run secret-backed code from an unintended ref | Pinned Actions to full verified commits, disabled persisted checkout credentials, restricted remote smoke to `main`, added concurrency and the protected `zoho-remote-smoke` environment | Fixed in source; environment reviewer configuration remains an external release gate |
| CS-004 | Medium | Policy files could be mistaken for a runtime firewall | Enable a forbidden upstream tool while documentation implies default-deny enforcement | Metadata now states the direct path has no repository runtime filter; requires upstream Zoho selection, ChatGPT action review and live unfiltered verification; local bridge adds `--ignore-tool` filtering for both listing and calls | Fixed |
| CS-005 | Medium | Email content lacked a sufficiently explicit prompt-injection boundary | Malicious email asks the model to reveal prompts/secrets, invoke another app or change mailbox state | Skill now treats bodies, headers, raw messages and attachment text as untrusted data and forbids executing their instructions without a matching user request | Fixed |
| CS-006 | Low/Medium | Config-file checks were vulnerable to symlink/TOCTOU substitution | Swap a checked file or symlink between validation and read | File is opened with `O_NOFOLLOW`, then checked through the opened handle before reading; runtime tests cover symlink and permission rejection | Fixed |
| CS-007 | Low/Medium | Local OAuth cache location and permissions were implicit | Credential files land in a broad/default config location with weak permissions or persist after revocation | Redirected cache to `mail-for-zoho/mcp-auth`, set process umask `077`, documented deletion on revocation and removed inherited proxy/custom-CA environment | Fixed |

## Phase 3 — validation evidence

GitHub Actions run #67 (`30190283422`) completed successfully on remediation commit `6b11b1a6f7b1604ecbd6db7a03d96e2ce961937d`.

Successful gates:

- plugin and runtime contract validation;
- embedded Zoho endpoint scan;
- common token and private-key pattern scan;
- OpenAI submission-packet validation;
- public-source hygiene validation;
- JavaScript syntax validation;
- runtime security tests.

The runtime tests cover exact bridge pinning, blocked tool patterns, protected-env parsing, HTTPS/userinfo/fragment checks, environment isolation, `npx` resolution, endpoint redaction, file-mode enforcement and symlink rejection.

The live remote smoke test was not run during this review because the actual `ZOHO_MCP_URL` was not exposed to the reviewer and must not be pasted into chat. Before publication, run the protected main-branch workflow against the exact release commit and confirm the required tools are present while all forbidden tools are absent.

## Phase 4 — attack-path analysis

### Path A: malicious protected config to local code execution

Before remediation:

`attacker modifies env file -> shell launcher sources file -> arbitrary command executes with bridge user's environment and endpoint access`

After remediation:

`attacker modifies env file -> no-follow regular-file and mode checks -> strict one-key data parser -> URL validation -> shell-free spawn`

Remaining exposure: a user who can replace the private file and satisfies its ownership/permission context can still replace the endpoint value. The bridge does not establish file ownership as a cross-platform invariant. Use an OS secret manager or a correctly permissioned user-owned config directory.

### Path B: malicious environment or npm config to dependency execution

Before remediation:

`attacker sets version/PATH/NODE_OPTIONS/npm config -> launcher invokes npx -> attacker-controlled code runs while endpoint is present`

After remediation:

`fixed package spec + Node-adjacent npx + sanitized PATH + minimal child environment + ignored npm scripts + fixed registry and config files`

Remaining exposure: `npx` may still retrieve the exact package from npm when it is not cached. Exact versioning reduces but does not eliminate registry, maintainer-account or transitive-dependency risk.

### Path C: malicious email to tool escalation or secret disclosure

`attacker sends instruction-like email -> model reads content -> content attempts to override user intent -> skill marks it untrusted -> no tool or secret action without matching user request`

Remaining exposure: prompt-injection resistance is partly model and product-control dependent. Keep the upstream tool surface narrow, require confirmation for low-risk writes and do not add send/delete tools to release 1.

### Path D: unsafe upstream tool configuration

`administrator enables send/delete/admin tool -> direct ChatGPT connection scans tool -> unsafe tool could become callable`

Controls:

- explicit upstream allowlist requirement;
- ChatGPT action review where available;
- unfiltered remote verifier that fails on forbidden tool names;
- optional local bridge blocks matching tools from both `tools/list` and `tools/call`.

Remaining exposure: the direct ChatGPT-to-Zoho path cannot be filtered by this repository because OnlineChefGroep deliberately operates no proxy. Provider-side configuration remains authoritative.

### Path E: workflow supply-chain compromise

Before remediation:

`mutable Action reference or retained checkout credential -> compromised workflow code -> repository or smoke secret exposure`

After remediation:

`full Action commit pins + read-only permissions + no persisted checkout credential + protected main-only environment + concurrency`

Remaining exposure: GitHub environment required reviewers must be configured after the clean public repository is created. A repository administrator can still deliberately modify workflow and environment settings.

## Residual risks and release blockers

1. **Process argument exposure:** the local bridge passes the endpoint as an argument because this is the `mcp-remote` interface. Do not run it on an untrusted shared host.
2. **Runtime dependency retrieval:** the exact package may be downloaded from npm at execution time. A future hardening release should vendor or lock/install the bridge through a reviewed dependency lockfile and use a local binary.
3. **Provider-side enforcement:** the direct ChatGPT path relies on Zoho tool selection and ChatGPT app/action controls. The repository cannot independently block those calls without becoming a proxy.
4. **No live endpoint test in this review:** the protected remote smoke test remains mandatory on the final release commit.
5. **Version review:** the branch intentionally remains on reviewed `mcp-remote@0.1.37`; upgrade separately after changelog, source and live compatibility review.
6. **Fresh history required:** export this working tree to a new public repository as a fresh initial commit. Do not publish the private operational history.
7. **External app review:** no OpenAI app ID or template ID exists yet. `.app.json` must remain absent until a real platform identifier is assigned.

## Release decision

**Conditional pass for clean-source export.**

The identified source-level findings are fixed and the remediation commit passed all static/runtime CI gates. Public release remains blocked until the tree is imported with fresh history, public legal/support URLs resolve anonymously, the protected live MCP smoke succeeds on the exact release commit, the GitHub environment has required reviewers and the real OpenAI app/template review is completed.
