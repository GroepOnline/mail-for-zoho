#!/usr/bin/env node

import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

function isReservedExampleEndpoint(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'example.test' || host.endsWith('.example.test') || host === 'example.com' || host.endsWith('.example.com');
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['.git', 'node_modules', 'coverage', '.tmp'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const metadata = await readJson('chatgpt/app-metadata.json');
const policy = await readJson('chatgpt/tool-policy.json');
const plugin = await readJson('.codex-plugin/plugin.json');
const pkg = await readJson('package.json');
const mcp = await readJson('.mcp.json');

assert(metadata.format === 'mail-for-zoho.chatgpt-mcp-install/v1', 'unexpected app metadata format');
assert(metadata.name === 'Mail for Zoho', 'app metadata must use the public product name');
assert(!('expected_mailboxes' in metadata), 'public metadata must not contain organization mailbox addresses');
assert(metadata.endpoint?.environment_variable === 'ZOHO_MCP_URL', 'endpoint must come from ZOHO_MCP_URL');
assert(metadata.endpoint?.transport === 'streamable-http', 'ChatGPT endpoint must use streamable HTTP');
assert(metadata.endpoint?.must_be_https === true, 'ChatGPT endpoint must require HTTPS');
assert(metadata.authentication?.protocol === 'OAuth 2.1', 'Zoho MCP authentication protocol must be explicit');
assert(metadata.policy_enforcement?.direct_remote_runtime_filter === false, 'direct ChatGPT path must not claim a repository runtime filter');
assert(metadata.policy_enforcement?.local_bridge_runtime_filter === true, 'local bridge defense-in-depth filter must be declared');
assert(metadata.policy_enforcement?.upstream_tool_selection_required === true, 'upstream Zoho tool selection must be required');
assert(metadata.policy_enforcement?.live_verification_required === true, 'live tool-surface verification must be required');
assert(Array.isArray(metadata.required_tools) && metadata.required_tools.length >= 6, 'required tool list is incomplete');
assert(metadata.support_document === 'SUPPORT.md', 'public support document must be declared');

assert(policy.format === 'mail-for-zoho.mcp-tool-policy/v1', 'unexpected tool-policy format');
assert(policy.default === 'deny', 'tool policy must default deny');
assert(policy.enforcement?.direct_remote_runtime_filter === false, 'tool policy must disclose that the direct remote path is not filtered by this repository');
assert(policy.enforcement?.local_bridge_runtime_filter === true, 'tool policy must declare local bridge filtering');

const allowed = new Set([
  ...policy.groups.read.tools,
  ...policy.groups.low_risk_write.tools,
]);
for (const tool of metadata.required_tools) {
  assert(allowed.has(tool), `required tool is not allowed by policy: ${tool}`);
}
const forbiddenPattern = new RegExp(`(${policy.groups.outbound_or_destructive.name_patterns.join('|')})`, 'i');
for (const tool of allowed) {
  assert(!forbiddenPattern.test(tool), `forbidden tool appears in an allowed group: ${tool}`);
}

assert(plugin.name === 'mail-for-zoho', 'plugin name must match the public package name');
assert(/^\d+\.\d+\.\d+$/.test(plugin.version), 'plugin version must be semantic');
assert(plugin.version === pkg.version, 'plugin.json version must equal package.json version');
assert(plugin.skills === './skills/zoho-mail/', 'plugin skills path must load only the generic Zoho skill');
assert(plugin.mcpServers === './.mcp.json', 'plugin MCP path must be ./.mcp.json');
assert(!plugin.apps, 'do not publish an .app.json reference before OpenAI assigns a real app ID');
assert(plugin.interface?.category === 'Productivity', 'plugin category must be Productivity');
assert(plugin.interface?.capabilities?.includes('Read'), 'plugin must declare Read capability');
assert(await exists('skills/zoho-mail/SKILL.md'), 'generic Zoho Mail skill is missing');
assert(await exists('SUPPORT.md'), 'SUPPORT.md is missing');
assert(await exists('examples/cursor.multi-account.mcp.json'), 'multi-account Cursor example is missing');

const server = mcp.mcpServers?.['mail-for-zoho'];
assert(server, 'canonical MCP server entry is missing');
assert(server.command === 'node', 'plugin MCP launcher must use the hardened Node wrapper');
assert(Array.isArray(server.args) && server.args[0] === './scripts/run-local.mjs', 'plugin MCP launcher path is incorrect');
assert(server.cwd === '.', 'plugin MCP working directory must be the plugin root');
assert(
  JSON.stringify([...server.env_vars].sort()) === JSON.stringify(['ZOHO_MCP_ENV', 'ZOHO_MCP_URL']),
  'plugin env contract must contain only ZOHO_MCP_URL and ZOHO_MCP_ENV',
);
assert(await exists('scripts/run-local.mjs'), 'hardened local plugin launcher is missing');
assert(await exists('scripts/runtime-security.mjs'), 'runtime security helper is missing');
assert(await exists('tests/runtime-security.test.mjs'), 'runtime security tests are missing');
assert(!(await exists('deploy/run-local')), 'private fleet launcher must not ship in the public package');
assert(
  !(await exists(['skills', 'chefgroep-mail', 'SKILL.md'].join('/'))),
  'organization-specific skill must not ship publicly',
);

const {
  BLOCKED_TOOL_PATTERNS,
  FORBIDDEN_TOOL_KEYWORDS,
  MCP_REMOTE_SPEC,
  PROFILE_PATTERN,
} = await import('./runtime-security.mjs');

assert(MCP_REMOTE_SPEC === 'mcp-remote@0.1.37', 'bridge package must stay exactly pinned');
assert(PROFILE_PATTERN instanceof RegExp, 'strict profile validation is missing');
assert(
  JSON.stringify([...FORBIDDEN_TOOL_KEYWORDS]) === JSON.stringify(policy.groups.outbound_or_destructive.name_patterns),
  'runtime forbidden keywords must match tool-policy name_patterns',
);
assert(BLOCKED_TOOL_PATTERNS.every((pattern) => pattern.startsWith('*') && pattern.endsWith('*')), 'blocked patterns must be mcp-remote globs');

const secretPatterns = [
  /phc_[A-Za-z0-9]{20,}/,
  /Zoho-oauthtoken\s+[A-Za-z0-9._-]{20,}/i,
  /client_secret\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/i,
];

const findings = [];
for (const file of await walk(root)) {
  const rel = path.relative(root, file);
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const match of content.matchAll(/ZOHO_MCP_URL\s*=\s*(https?:\/\/[^\s<]+)/gi)) {
    if (!isReservedExampleEndpoint(match[1])) {
      findings.push(`${rel}: contains a non-reserved embedded endpoint`);
    }
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) findings.push(`${rel}: matched ${pattern}`);
  }
}

assert(findings.length === 0, `possible secret material found:\n${findings.join('\n')}`);
console.log(`config ok: plugin=${plugin.name}@${plugin.version}, ${metadata.required_tools.length} required tools, public multi-account package, default-deny policy, no embedded endpoint detected`);
