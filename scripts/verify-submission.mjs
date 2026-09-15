#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
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

const plugin = await readJson('.codex-plugin/plugin.json');
const pkg = await readJson('package.json');
const submission = await readJson('openai/submission.json');
const evals = await readJson('openai/evals.json');
const skill = await readFile(path.join(root, 'skills/zoho-mail/SKILL.md'), 'utf8');
const privacy = await readFile(path.join(root, 'PRIVACY.md'), 'utf8');
const terms = await readFile(path.join(root, 'TERMS.md'), 'utf8');
const notice = await readFile(path.join(root, 'NOTICE'), 'utf8');

assert(plugin.name === 'mail-for-zoho', 'plugin name must be mail-for-zoho');
assert(plugin.version === pkg.version, 'plugin version must match package.json');
assert(plugin.license === 'MIT', 'public plugin must use the MIT license');
assert(plugin.skills === './skills/zoho-mail/', 'plugin must load only the generic Zoho skill');
assert(plugin.mcpServers === './.mcp.json', 'plugin must reference the MCP launcher');
assert(plugin.interface?.displayName === 'Mail for Zoho', 'unexpected display name');
assert(Array.isArray(plugin.interface?.defaultPrompt) && plugin.interface.defaultPrompt.length === 3, 'exactly three starter prompts are required');

for (const key of ['websiteURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  const value = plugin.interface?.[key];
  assert(typeof value === 'string' && value.startsWith('https://'), `${key} must be an HTTPS URL`);
}

assert(submission.format === 'onlinechefgroep.openai-plugin-submission/v1', 'unexpected submission format');
assert(submission.plugin?.name === plugin.name, 'submission and plugin names differ');
assert(submission.plugin?.license === plugin.license, 'submission and plugin licenses differ');
assert(submission.plugin?.unofficial_integration === true, 'unofficial affiliation disclosure is required');
assert(submission.app_template?.required === true, 'managed app template must be requested');
assert(submission.app_template?.platform_managed === true, 'template must remain platform managed');
assert(submission.app_template?.app_id === null, 'do not fabricate an app ID');
assert(submission.app_template?.template_id === null, 'do not fabricate a template ID');
assert(submission.app_template?.connection?.provider === 'Zoho MCP', 'provider must be Zoho MCP');
assert(submission.app_template?.connection?.direct_provider_connection === true, 'connection must be direct to Zoho');
assert(submission.app_template?.connection?.intermediary_server === false, 'OnlineChefGroep must not be in the mailbox data path');
assert(submission.app_template?.connection?.authentication === 'oauth', 'authentication must be OAuth');

const input = submission.app_template?.connection?.admin_inputs?.find((item) => item.name === 'zoho_mcp_url');
assert(input?.type === 'secret_url' && input?.sensitive === true && input?.required === true, 'Zoho MCP URL must be a required secret URL');

const forbidden = new Set(submission.capability_policy?.forbidden ?? []);
for (const capability of ['send', 'reply', 'forward', 'delete', 'trash', 'purge']) {
  assert(forbidden.has(capability), `missing forbidden capability: ${capability}`);
}

assert(evals.plugin === plugin.name, 'eval package targets another plugin');
assert(Array.isArray(evals.cases) && evals.cases.length >= 8, 'submission needs at least eight routing/safety evals');
assert(evals.cases.some((item) => item.id === 'prompt-injection-mail-body'), 'prompt-injection eval is required');
for (const id of [
  'exact-mailbox-selection',
  'ambiguous-mailbox-selection',
  'explicit-search-both-connections',
  'prevent-cross-account-mutation',
]) {
  assert(evals.cases.some((item) => item.id === id), `multi-account eval is required: ${id}`);
}

for (const phrase of [
  'ZohoMail_getMailAccounts',
  'Never send',
  'generated MCP URL',
  'does not proxy mailbox traffic',
  'exact case-insensitive match',
  'connection identity and mailbox address',
  'never transfer an account ID'
]) {
  assert(skill.includes(phrase), `generic skill is missing required policy text: ${phrase}`);
}

assert(privacy.includes('does not operate a mailbox proxy'), 'privacy notice must describe the direct data path');
assert(terms.includes('unofficial open-source integration'), 'terms must disclose unofficial status');
assert(notice.includes('not affiliated with, sponsored by, or endorsed by Zoho Corporation or OpenAI'), 'NOTICE must contain affiliation disclaimer');
assert(await exists('LICENSE'), 'LICENSE is required');
assert(await exists('assets/mail-for-zoho.svg'), 'public plugin icon is required');
assert(!(await exists('.app.json')), '.app.json must stay absent until OpenAI supplies a real app ID');

const serialized = JSON.stringify({ plugin, submission, evals });
for (const bad of ['TODO', 'REPLACE_ME', 'asdk_app_FAKE', 'template_FAKE']) {
  assert(!serialized.includes(bad), `submission contains placeholder or fabricated identifier: ${bad}`);
}

console.log(`submission ok: ${plugin.name}@${plugin.version}, direct Zoho OAuth, ${evals.cases.length} evals, no fabricated app ID`);
